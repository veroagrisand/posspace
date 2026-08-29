#!/usr/bin/env bash
# ============================================================
# Provisioning VPS Hostinger FRESH (Ubuntu 22.04/24.04) — sekali jalan.
#
# Penggunaan (jalankan sebagai user sudo/root):
#   sudo env DOMAIN=posspace.id \
#       GIT_REPO=git@github.com:AKUN/posspace.git \
#       ADMIN_EMAIL=admin@posspace.id \
#       bash deploy/init-server.sh
#
# Parameter (via env):
#   DOMAIN       (wajib) domain utama, mis. posspace.id
#   GIT_REPO     (wajib) URL repo GitHub (ssh:// atau https://)
#   GIT_BRANCH   branch deploy, default main
#   ADMIN_EMAIL  untuk notifikasi certbot, default admin@DOMAIN
#   SKIP_SSL=1   lewati certbot (pasang TLS manual nanti)
#   CERT_NAME   nama lineage certbot, default DOMAIN
#   APP_USER     user deploy, default "deploy"
#   APP_DIR      direktori aplikasi, default /var/www/posspace
# Idempotent: aman dijalankan ulang.
# ============================================================
set -euo pipefail

DOMAIN="${DOMAIN:-}"
GIT_REPO="${GIT_REPO:-}"
GIT_BRANCH="${GIT_BRANCH:-main}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@${DOMAIN}}"
SKIP_SSL="${SKIP_SSL:-0}"
APP_USER="${APP_USER:-deploy}"
APP_DIR="${APP_DIR:-/var/www/posspace}"
NGINX_CONFIG="${NGINX_CONFIG:-$APP_DIR/deploy/nginx.conf}"
NGINX_BOOTSTRAP_CONFIG="${NGINX_BOOTSTRAP_CONFIG:-$APP_DIR/deploy/nginx-bootstrap.conf}"

if [ -z "$DOMAIN" ] || [ -z "$GIT_REPO" ]; then
	echo "ERROR: DOMAIN dan GIT_REPO wajib diisi."
	echo "Contoh: sudo env DOMAIN=posspace.id GIT_REPO=git@github.com:user/posspace.git bash deploy/init-server.sh"
	exit 1
fi

CERT_NAME="${CERT_NAME:-$DOMAIN}"
if [ "$CERT_NAME" = "$DOMAIN" ] && sudo test -d "/etc/letsencrypt/live/$CERT_NAME" \
	&& ! sudo test -f "/etc/letsencrypt/renewal/$CERT_NAME.conf"; then
	# Folder live lama bisa berasal dari sertifikat self-signed dan membuat
	# certbot menolak membuat lineage dengan nama domain yang sama.
	CERT_NAME="${DOMAIN}-letsencrypt"
	echo "(folder sertifikat lama terdeteksi — memakai lineage $CERT_NAME)"
fi
CERT_DIR="/etc/letsencrypt/live/$CERT_NAME"

log() { echo -e "\n\033[1;32m==> $*\033[0m"; }

has_tls_certificate() {
	sudo test -s "$CERT_DIR/fullchain.pem" && sudo test -s "$CERT_DIR/privkey.pem"
}

install_nginx_config() {
	local source="$1"
	if [ ! -f "$source" ]; then
		echo "ERROR: konfigurasi Nginx tidak ditemukan: $source"
		exit 1
	fi
	sudo cp "$source" /etc/nginx/sites-available/posspace
	sudo sed -i "s/posspace\.id/$DOMAIN/g" /etc/nginx/sites-available/posspace
	sudo sed -i "s#live/$DOMAIN/#live/$CERT_NAME/#g" /etc/nginx/sites-available/posspace
	sudo ln -sf /etc/nginx/sites-available/posspace /etc/nginx/sites-enabled/posspace
	sudo rm -f /etc/nginx/sites-enabled/default
}

log "1/12 Update sistem & paket dasar"
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq
sudo apt-get upgrade -y -qq
sudo apt-get install -y -qq curl git build-essential ufw nginx ca-certificates gnupg >/dev/null

log "2/12 Node.js 22 LTS (NodeSource)"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]; then
	curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null
	sudo apt-get install -y -qq nodejs >/dev/null
fi
echo "node: $(node -v) · npm: $(npm -v)"

log "3/12 PM2 global"
sudo npm install -g pm2 >/dev/null 2>&1 || true
pm2 -v >/dev/null 2>&1 || sudo npm install -g pm2

log "4/12 User deploy ($APP_USER)"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
	sudo adduser --disabled-password --gecos "" "$APP_USER"
	sudo usermod -aG sudo "$APP_USER"
fi

log "5/12 Direktori aplikasi & log"
sudo mkdir -p "$APP_DIR" /var/log/posspace
sudo chown -R "$APP_USER":"$APP_USER" "$APP_DIR" /var/log/posspace

log "6/12 Clone repo"
if [ ! -d "$APP_DIR/.git" ]; then
	sudo -u "$APP_USER" git clone "$GIT_REPO" "$APP_DIR"
	sudo -u "$APP_USER" git -C "$APP_DIR" checkout "$GIT_BRANCH" 2>/dev/null || true
else
	sudo -u "$APP_USER" git -C "$APP_DIR" fetch origin
	sudo -u "$APP_USER" git -C "$APP_DIR" reset --hard "origin/$GIT_BRANCH"
	echo "(repo sudah ada — disinkronkan ke $GIT_BRANCH)"
fi

log "7/12 File .env"
if [ ! -f "$APP_DIR/.env" ]; then
	sudo -u "$APP_USER" cp "$APP_DIR/.env.example" "$APP_DIR/.env"
	echo ">>> EDIT SEKARANG: sudo -u $APP_USER nano $APP_DIR/.env"
	echo ">>> (isi SUPABASE_*, IPAYMU_*, SMTP_*; set ALLOW_*=false)"
	echo ">>> Lanjut otomatis setelah Anda menekan ENTER di sini."
	read -r -p "Sudah selesai mengisi .env? [Enter]" _
fi

log "8/12 Nginx reverse proxy"
sudo mkdir -p /var/www/certbot
if has_tls_certificate; then
	install_nginx_config "$NGINX_CONFIG"
else
	# Nginx harus hidup dengan HTTP saja agar Let's Encrypt dapat memvalidasi
	# domain sebelum file sertifikat dipakai oleh konfigurasi HTTPS.
	install_nginx_config "$NGINX_BOOTSTRAP_CONFIG"
fi
sudo nginx -t
sudo systemctl enable nginx >/dev/null 2>&1 || true
sudo systemctl reload nginx

log "9/12 Firewall (ufw): hanya 22/80/443"
sudo ufw allow OpenSSH >/dev/null 2>&1 || true
sudo ufw allow 80/tcp >/dev/null 2>&1 || true
sudo ufw allow 443/tcp >/dev/null 2>&1 || true
sudo ufw --force enable >/dev/null 2>&1 || true
sudo ufw status | head -8

log "10/12 TLS via Let's Encrypt (certbot)"
if [ "$SKIP_SSL" = "1" ]; then
	echo "(dilewati — SKIP_SSL=1; jalankan nanti: sudo certbot certonly --webroot -w /var/www/certbot -d $DOMAIN -d www.$DOMAIN)"
else
	sudo apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
	sudo certbot certonly --webroot -w /var/www/certbot \
		--cert-name "$CERT_NAME" \
		-d "$DOMAIN" -d "www.$DOMAIN" \
		--keep-until-expiring --agree-tos --non-interactive -m "$ADMIN_EMAIL"
	install_nginx_config "$NGINX_CONFIG"
	sudo nginx -t
	sudo systemctl reload nginx
fi

log "11/12 Deploy pertama"
if grep -q '^SUPABASE_URL=.' "$APP_DIR/.env"; then
	sudo -u "$APP_USER" env GIT_BRANCH="$GIT_BRANCH" bash "$APP_DIR/deploy/deploy.sh"
else
	echo "(.env belum berisi SUPABASE_URL — deploy manual nanti: bash deploy/deploy.sh)"
fi

log "12/12 PM2 startup (auto-restart saat reboot)"
sudo -u "$APP_USER" env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" >/dev/null 2>&1 || true
sudo -u "$APP_USER" pm2 save >/dev/null 2>&1 || true

echo ""
echo "======================================================"
echo " VPS SIAP."
echo "   App   : $APP_DIR  (user $APP_USER)"
echo "   Web   : https://$DOMAIN"
echo "   Logs  : pm2 logs posspace-web / posspace-api"
echo ""
echo " Langkah auto-deploy berikutnya (di MESIN LOKAL):"
echo "   bash deploy/setup-auto-deploy.sh"
echo "   (buat SSH key, isi secrets GitHub, push ke main → deploy otomatis)"
echo "======================================================"
