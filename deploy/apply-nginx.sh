#!/usr/bin/env bash
# ============================================================
# Apply konfigurasi Nginx + logrotate secara idempotent.
# Idempotent & aman: hanya reload bila file berubah; batal bila
# `nginx -t` gagal; pakai sudo non-interaktif (NOPASSWD) agar
# bisa dijalankan dari auto-deploy tanpa prompt password.
#
# Penggunaan (di VPS):
#   bash deploy/apply-nginx.sh
#   # atau override: DOMAIN=posspace.id CERT_LINEAGE=posspace.id-letsencrypt
# ============================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/posspace}"
NGINX_CONF="${NGINX_CONF:-$APP_DIR/deploy/nginx.conf}"
LOGROTATE_CONF="${LOGROTATE_CONF:-$APP_DIR/deploy/logrotate-posspace.conf}"
DOMAIN="${DOMAIN:-}"
CERT_LINEAGE="${CERT_LINEAGE:-}"

if [ ! -f "$NGINX_CONF" ]; then
	echo "ERROR: konfigurasi Nginx tidak ditemukan: $NGINX_CONF"
	exit 1
fi

# Deteksi domain/lineage dari konfigurasi yang sudah terpasang bila tidak di-set.
if [ -z "$DOMAIN" ] && [ -f /etc/nginx/sites-available/posspace ]; then
	DOMAIN="$(grep -hoE 'server_name [^;]+' /etc/nginx/sites-available/posspace | awk '{print $2}' | head -1)"
fi
DOMAIN="${DOMAIN:-posspace.id}"
if [ -z "$CERT_LINEAGE" ]; then
	CERT_LINEAGE="$(basename "$(grep -hoE 'ssl_certificate\s+[^;]+' /etc/nginx/sites-available/posspace 2>/dev/null | head -1 | sed -E 's#.*/live/([^/]+)/.*#\1#')" 2>/dev/null || true)"
fi
CERT_LINEAGE="${CERT_LINEAGE:-${DOMAIN}-letsencrypt}"

tmp="$(mktemp)"
sed -e "s/posspace\.id/$DOMAIN/g" -e "s#live/$DOMAIN/#live/$CERT_LINEAGE/#g" "$NGINX_CONF" > "$tmp"

apply_nginx() {
	if ! diff -q "$tmp" /etc/nginx/sites-available/posspace >/dev/null 2>&1; then
		if ! sudo -n install -m 644 "$tmp" /etc/nginx/sites-available/posspace 2>/dev/null; then
			echo "WARN: sudo non-interaktif untuk install nginx gagal — lewati (pasang NOPASSWD di sudoers)."
			return 0
		fi
		sudo -n ln -sf /etc/nginx/sites-available/posspace /etc/nginx/sites-enabled/posspace 2>/dev/null || true
		if sudo -n nginx -t 2>/dev/null; then
			sudo -n systemctl reload nginx 2>/dev/null || true
			echo "nginx: konfigurasi baru diterapkan + reload"
		else
			echo "WARN: nginx -t gagal — konfigurasi lama tetap aktif (file tersimpan di sites-available)."
		fi
	else
		echo "nginx: konfigurasi sudah mutakhir — dilewati"
	fi
}

apply_nginx
rm -f "$tmp"

if [ -f "$LOGROTATE_CONF" ]; then
	if sudo -n install -m 644 "$LOGROTATE_CONF" /etc/logrotate.d/posspace 2>/dev/null; then
		echo "logrotate: konfigurasi terpasang"
	else
		echo "WARN: logrotate tidak dipasang (sudo non-interaktif gagal)."
	fi
fi

exit 0
