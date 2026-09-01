#!/usr/bin/env bash
# ============================================================
# Deploy posspace microservices ke VPS (manual / via auto-deploy)
#
# 1) Siapkan server (sekali):  sudo env DOMAIN=... GIT_REPO=... bash deploy/init-server.sh
# 2) Deploy rilis:             bash deploy/deploy.sh
# 3) Auto-deploy:              push ke branch main di GitHub
#                              (workflow .github/workflows/deploy.yml
#                               SSH ke VPS lalu menjalankan skrip ini)
# 4) Rollback:                 bash deploy/deploy.sh --rollback
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."

# Kunci deploy: cegah dua deploy berjalan bersamaan (auto + manual).
if command -v flock >/dev/null 2>&1; then
	exec 9>"${PWD}/deploy.lock"
	flock -n 9 || { echo "ERROR: deploy lain sedang berjalan — tunggu atau hapus deploy.lock."; exit 1; }
	trap 'rm -f "${PWD}/deploy.lock"' EXIT
else
	echo "(flock tidak tersedia di sistem ini — lock dilewati)"
fi

[ -f .env ] || { echo "ERROR: file .env belum ada di $PWD."; echo "       cp .env.example .env lalu isi kredensial."; exit 1; }
if ! bash -n .env; then
	echo "ERROR: format .env tidak valid untuk shell. Kutip nilai yang berisi spasi atau karakter seperti < dan >."
	exit 1
fi

# npm kadang melewatkan optional dependency native saat npm ci dijalankan
# pada Linux dengan lockfile yang dibuat di macOS. Rolldown membutuhkannya
# saat build frontend, jadi pasang binding glibc Linux secara eksplisit jika
# paketnya belum tersedia. --package-lock=false menjaga lockfile repository
# tetap bersih di server.
repair_rolldown_binding() {
	local version
	if [ "$(uname -s)" != "Linux" ] || [ "$(uname -m)" != "x86_64" ]; then
		return 0
	fi
	version="$(node -p "require('./node_modules/rolldown/package.json').version" 2>/dev/null || true)"
	if [ -z "$version" ] || node -e "require.resolve('@rolldown/binding-linux-x64-gnu')" >/dev/null 2>&1; then
		return 0
	fi
	echo "==> Native Rolldown binding tidak ditemukan — memasang versi $version"
	npm install --include=optional --no-save --package-lock=false --no-audit --no-fund "@rolldown/binding-linux-x64-gnu@${version}"
}

ROLLBACK="${1:-}"
GIT_BRANCH="${GIT_BRANCH:-main}"
if [ "$ROLLBACK" = "--rollback" ]; then
	if [ ! -f .last-release ]; then
		echo "ERROR: tidak ada .last-release (belum pernah deploy sukses)."
		exit 1
	fi
	echo "==> Rollback ke commit $(cat .last-release)"
	git reset --hard "$(cat .last-release)"
	ROLLBACK=1
fi

if [ "$ROLLBACK" != "1" ]; then
	echo "==> 1/6 Git pull (ff-only)"
	git fetch origin || echo "(tanpa remote origin — lanjut dengan kode yang ada)"
	git pull --ff-only origin "$GIT_BRANCH" 2>/dev/null || echo "(pull dilewati / tidak ada remote)"
else
	echo "==> 1/6 Rollback mode — pull dilewati"
fi
PREV_COMMIT="$(git rev-parse HEAD 2>/dev/null || echo unknown)"

echo "==> 2/6 Install dependencies (workspaces)"
# Vite/Rolldown membutuhkan native binding platform yang dipasang sebagai
# optional dependency. --include=optional juga mengesampingkan omit global npm.
# nice: proses web yang sedang berjalan tidak tersaingi CPU saat build.
nice -n 15 npm ci --include=optional
repair_rolldown_binding

echo "==> 3/6 Build backend (apps/api)"
nice -n 15 npm run build:api

echo "==> 4/6 Build frontend (web)"
nice -n 15 npm run build

echo "==> 5/6 Reload PM2 (env dari .env root ikut di-load)"
# Nilai env dengan karakter khusus (spasi/#/baris baru) sebaiknya diberi
# tanda kutip di .env. parse sederhana ini me-load seluruh file.
set -a
# shellcheck disable=SC1091
source .env
set +a
pm2 reload deploy/ecosystem.config.cjs --update-env || pm2 start deploy/ecosystem.config.cjs --update-env
pm2 save

echo "==> 6/6 Health check"
# Beri waktu worker PM2 selesai boot (maksimal ~15 detik) sebelum menilai gagal.
API_OK=0
WEB_OK=0
for attempt in $(seq 1 15); do
	if [ "$API_OK" -eq 0 ] && curl -fsS -m 5 http://127.0.0.1:3001/health >/dev/null; then
		API_OK=1
	fi
	if [ "$WEB_OK" -eq 0 ] && curl -fsS -m 5 -o /dev/null http://127.0.0.1:3000/login; then
		WEB_OK=1
	fi
	if [ "$API_OK" -eq 1 ] && [ "$WEB_OK" -eq 1 ]; then
		break
	fi
	sleep 1
done
if [ "$API_OK" -ne 1 ]; then
	echo "ERROR: API tidak sehat setelah deploy."
	pm2 logs posspace-api --lines 40 --nostream || true
	exit 1
fi
if [ "$WEB_OK" -ne 1 ]; then
	echo "ERROR: web tidak merespons setelah deploy."
	pm2 logs posspace-web --lines 40 --nostream || true
	exit 1
fi

echo "$PREV_COMMIT" > .last-release

echo ""
echo "==> Deploy sukses. Status PM2:"
pm2 status
echo ""
echo "Cek dari luar:  curl -sI https://$(grep -oE 'server_name [^;]+' /etc/nginx/sites-available/posspace 2>/dev/null | awk '{print $2}' | head -1 || echo 'domain-anda.com') | head -3"
