#!/usr/bin/env bash
# ============================================================
# Deploy posspace microservices ke VPS (manual / via auto-deploy)
#
# 1) Siapkan server (sekali):  sudo bash deploy/init-server.sh
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

ROLLBACK="${1:-}"
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
	git pull --ff-only origin main 2>/dev/null || echo "(pull dilewati / tidak ada remote)"
else
	echo "==> 1/6 Rollback mode — pull dilewati"
fi
PREV_COMMIT="$(git rev-parse HEAD 2>/dev/null || echo unknown)"

echo "==> 2/6 Install dependencies (workspaces)"
npm ci --omit=optional || npm install

echo "==> 3/6 Build backend (apps/api)"
npm run build:api

echo "==> 4/6 Build frontend (web)"
npm run build

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
sleep 1
if ! curl -fsS -m 5 http://127.0.0.1:3001/health >/dev/null; then
	echo "ERROR: API tidak sehat setelah deploy."
	pm2 logs posspace-api --lines 40 --nostream || true
	exit 1
fi
if ! curl -fsS -m 5 -o /dev/null http://127.0.0.1:3000/login; then
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