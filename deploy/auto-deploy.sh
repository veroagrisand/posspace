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

echo "[auto-deploy] jalankan deploy.sh untuk origin/$GIT_BRANCH"
# Lock dan git pull ditangani satu kali oleh deploy.sh. Lock terpisah di sini
# akan membuat deploy.sh menganggap dirinya dijalankan bersamaan dengan deploy lain.
exec env GIT_BRANCH="$GIT_BRANCH" bash "${APP_DIR}/deploy/deploy.sh"

echo "[auto-deploy] selesai — $(date -u +%FT%TZ)"
