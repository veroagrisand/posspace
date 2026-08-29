#!/usr/bin/env bash
# ============================================================
# Setup auto-deploy GitHub Actions → VPS (jalankan di MESIN LOKAL)
# 1. Generate SSH deploy key (sekali)
# 2. Instruksi pasang public key di VPS
# 3. Instruksi isi secrets GitHub
# ============================================================
set -euo pipefail

KEY="$HOME/.ssh/posspace_deploy"
PUB="$KEY.pub"

if [ ! -f "$KEY" ]; then
	echo "==> Membuat SSH deploy key (ed25519, tanpa passphrase)..."
	ssh-keygen -t ed25519 -N "" -f "$KEY" -C "posspace-auto-deploy" >/dev/null
fi

echo ""
echo "======================================================"
echo " 1) PASANG PUBLIC KEY DI VPS (jalankan dari mesin lokal):"
echo "    ssh-copy-id -i $PUB deploy@VPS_IP"
echo "    # atau manual:"
echo "    cat $PUB | ssh deploy@VPS_IP 'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'"
echo ""
echo "    Uji:  ssh -i $KEY deploy@VPS_IP 'echo OK'"
echo ""
echo " 2) ISI SECRETS DI GITHUB:"
echo "    Repo GitHub → Settings → Secrets and variables → Actions → New repository secret:"
echo "    ------------------------------------------------------------"
echo "    Nama           | Nilai"
echo "    ---------------|---------------------------------------------"
echo "    VPS_HOST       | IP atau domain VPS (mis. 123.123.123.123)"
echo "    VPS_USER       | deploy"
echo "    VPS_SSH_KEY    | ISI DI BAWAH INI (private key, mulai dari ---)"
echo "    ------------------------------------------------------------"
echo ""
echo "    (opsional) VPS_PATH = /var/www/posspace   — lokasi repo di VPS"
echo "======================================================"
echo ""
echo "PRIVATE KEY untuk secret VPS_SSH_KEY:"
cat "$KEY"
echo ""
echo "======================================================"
echo " 3) OPSIONAL — keamanan ekstra (forced command di VPS):"
echo "    Edit /home/deploy/.ssh/authorized_keys, ubah baris key menjadi:"
echo "    restrict,command=\"/var/www/posspace/deploy/auto-deploy.sh\" $(cat "$PUB")"
echo "    → key hanya bisa memicu deploy, tidak bisa shell bebas."
echo "======================================================"