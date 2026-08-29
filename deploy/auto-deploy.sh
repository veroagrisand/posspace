#!/usr/bin/env bash
# ============================================================
# Entry point auto-deploy — dipakai sebagai forced command di
# authorized_keys (opsi keamanan ekstra). Key SSH hanya boleh
# memicu skrip ini, bukan membuka shell bebas.
#
# authorized_keys:
#   restrict,command="/var/www/posspace/deploy/auto-deploy.sh" ssh-ed25519 AAAA...
# ============================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/posspace}"
GIT_BRANCH="${GIT_BRANCH:-main}"

cd "$APP_DIR"

exec 9>"${APP_DIR}/deploy.lock"
if command -v flock >/dev/null 2>&1; then
	flock -n 9 || { echo "Deploy lain sedang berjalan."; exit 1; }
	trap 'rm -f "${APP_DIR}/deploy.lock"' EXIT
fi

echo "[auto-deploy] pull origin/$GIT_BRANCH"
git fetch origin
git pull --ff-only origin "$GIT_BRANCH"

echo "[auto-deploy] jalankan deploy.sh"
bash "${APP_DIR}/deploy/deploy.sh"

echo "[auto-deploy] selesai — $(date -u +%FT%TZ)"