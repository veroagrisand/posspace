# Panduan Midtrans Produksi dan Auto-Deploy

Panduan ini untuk deployment posspace pada:

- Domain: `posspace.id`
- VPS: `72.62.125.60`
- Direktori aplikasi: `/var/www/posspace`
- User aplikasi: `deploy`

Jangan memasukkan API Key, password SMTP, service role key, private key, atau
isi `.env` ke repository GitHub.

## 1. Aktivasi Midtrans

### 1.1 Siapkan kredensial produksi

Di dashboard Midtrans, aktifkan produk pembayaran yang diperlukan dan ambil
kredensial **produksi** (Settings → Access Keys):

- Server Key
- Client Key
- Channel pembayaran yang sudah disetujui, misalnya QRIS

Kredensial sandbox dan produksi berbeda. Untuk sandbox gunakan
`https://dashboard.sandbox.midtrans.com`; untuk produksi gunakan
`https://dashboard.midtrans.com`. Environment dikendalikan `MIDTRANS_ENV`
(`sandbox` atau `production`).

### 1.2 Isi environment di VPS

Jalankan di VPS:

```bash
sudo -u deploy nano /var/www/posspace/.env
```

Pastikan konfigurasi berikut diisi:

```env
MIDTRANS_SERVER_KEY=ISI_SERVER_KEY_PRODUKSI
MIDTRANS_CLIENT_KEY=ISI_CLIENT_KEY_PRODUKSI
MIDTRANS_ENV=production

ALLOW_DEMO_MODE=false
ALLOW_MOCK_PAYMENT=false
ALLOW_MANUAL_ACTIVATION=false
ALLOW_OTP_DEBUG=false

SMTP_FROM="posspace <info@posspace.id>"
```

Nilai berikut juga harus sudah tersedia di `.env` VPS:

```env
PUBLIC_SUPABASE_URL=...
PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=...
SMTP_PASS=...
```


Validasi file tanpa menampilkan nilainya:

```bash
sudo -u deploy bash -n /var/www/posspace/.env
sudo chmod 600 /var/www/posspace/.env
sudo chown deploy:deploy /var/www/posspace/.env
```

### 1.3 Daftarkan notifikasi Midtrans

Masukkan URL notifikasi berikut pada dashboard Midtrans
(Settings → Configuration → Payment Notification URL):

```text
https://posspace.id/api/payments/midtrans/notification
```

URL ini harus dapat diakses publik melalui HTTPS. Aplikasi memvalidasi
`signature_key` notifikasi menggunakan Server Key (HMAC-SHA512).

Alur yang digunakan aplikasi:

- Langganan baru diarahkan ke halaman Snap Midtrans.
- Pembayaran POS QRIS dibuat sebagai transaksi `pending`.
- Notifikasi Midtrans mengubah status menjadi lunas dan memotong stok sesuai resep.
- Polling status menjadi cadangan jika notifikasi terlambat.

### 1.4 Deploy pertama setelah Midtrans aktif

Pastikan kode terbaru sudah tersedia di branch `main`, kemudian di VPS:

```bash
cd /var/www/posspace
sudo -u deploy git pull --ff-only origin main
sudo -u deploy bash deploy/deploy.sh
```

Script deploy melakukan install dependency, build API dan web, reload PM2, lalu
menjalankan health check.

Jika muncul `Cannot find native binding`, jalankan pemulihan berikut:

```bash
cd /var/www/posspace
sudo -u deploy rm -rf node_modules
sudo -u deploy npm ci --include=optional
sudo -u deploy npm run build:api
sudo -u deploy npm run build
sudo -u deploy bash -lc 'cd /var/www/posspace && set -a && . ./.env && set +a && (pm2 reload deploy/ecosystem.config.cjs --update-env || pm2 start deploy/ecosystem.config.cjs --update-env) && pm2 save'
```

## 2. Konfigurasi Auto-Deploy

Workflow berada di `.github/workflows/deploy.yml`. Workflow berjalan saat ada
push ke branch `main` atau dijalankan manual dari menu **Actions**.

### 2.1 Push kode terbaru

Commit dan push perubahan kode deployment yang sudah direview. Jangan pernah
menambahkan `.env`:

```bash
git status
git add .github/workflows/deploy.yml deploy apps/api/src/services/payment.ts .env.example
git commit -m "fix production deployment and Midtrans notification"
git push origin main
```

Jika ada file dokumentasi lain yang ingin disertakan, tambahkan secara eksplisit
dan periksa `git diff --cached` sebelum commit.

### 2.2 Buat key SSH Actions ke VPS

Jalankan di komputer lokal:

```bash
bash deploy/setup-auto-deploy.sh
```

Pasang public key ke user `deploy` di VPS:

```bash
ssh-copy-id -i ~/.ssh/posspace_deploy.pub deploy@72.62.125.60
ssh -i ~/.ssh/posspace_deploy deploy@72.62.125.60 'echo SSH_OK'
```

Key `~/.ssh/posspace_deploy` adalah private key untuk GitHub Actions. Jangan
commit atau mengirimkannya ke repository.

### 2.3 Isi GitHub Secrets

Buka **Repository Settings → Secrets and variables → Actions → Secrets** dan
buat:

| Nama | Nilai |
|---|---|
| `VPS_HOST` | `72.62.125.60` |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | Isi private key `~/.ssh/posspace_deploy` |

Tambahkan Variables berikut:

| Nama | Nilai |
|---|---|
| `VPS_PATH` | `/var/www/posspace` |
| `VPS_PORT` | `22` |

### 2.4 Pastikan VPS dapat pull dari GitHub

Ada dua koneksi SSH yang berbeda:

1. GitHub Actions → VPS, memakai key `posspace_deploy`.
2. VPS → GitHub, dipakai oleh `git pull` saat deploy.

Jika repository privat, buat deploy key khusus untuk VPS:

```bash
sudo -u deploy mkdir -p /home/deploy/.ssh
sudo -u deploy ssh-keygen -t ed25519 -N '' -f /home/deploy/.ssh/github_posspace
sudo -u deploy chmod 600 /home/deploy/.ssh/github_posspace
```

Tambahkan public key `/home/deploy/.ssh/github_posspace.pub` ke **Repository
Settings → Deploy keys** dengan akses read-only. Setelah itu uji:

```bash
sudo -u deploy ssh -T git@github.com
sudo -u deploy git -C /var/www/posspace pull --ff-only origin main
```

Jika repository menggunakan key khusus tersebut, atur SSH command pada clone:

```bash
sudo -u deploy git -C /var/www/posspace config core.sshCommand 'ssh -i /home/deploy/.ssh/github_posspace -o IdentitiesOnly=yes'
```

### 2.5 Jalankan auto-deploy

Setelah secrets, variables, dan akses pull siap:

```bash
git push origin main
```

Pantau **GitHub → Actions → Auto Deploy ke VPS**. Di VPS, cek:

```bash
sudo -u deploy pm2 status
sudo -u deploy pm2 logs posspace-api --lines 50
sudo -u deploy pm2 logs posspace-web --lines 50
```

`.env` tetap berada di VPS dan tidak dikirim oleh GitHub Actions.

## 3. Verifikasi Produksi

### 3.1 Infrastruktur

```bash
curl -I https://posspace.id/login
sudo nginx -t
sudo systemctl status nginx --no-pager
sudo -u deploy pm2 status
```

Health check internal:

```bash
curl http://127.0.0.1:3001/health
curl -I http://127.0.0.1:3000/login
```

Respons yang diharapkan:

- HTTPS `/login`: `200`
- API `/health`: JSON dengan `"ok":true`
- PM2: `posspace-web` dan `posspace-api` berstatus `online`

### 3.2 Pembayaran Midtrans

1. Login dengan akun reviewer atau akun toko yang sudah memiliki subscription aktif.
2. Buka POS dan buat transaksi.
3. Pilih QRIS.
4. Pastikan QR/payment URL muncul.
5. Selesaikan pembayaran menggunakan environment yang sesuai.
6. Pastikan callback mengubah status transaksi menjadi `paid` atau `completed`.
7. Pastikan stok bahan berkurang satu kali sesuai resep.

Gunakan sandbox sebelum produksi. Pada production, transaksi pembayaran dapat
memotong dana nyata.

### 3.3 Renewal sertifikat

Pastikan renewal Certbot berjalan:

```bash
sudo certbot renew --dry-run
```

Konfigurasi Nginx menyediakan route ACME:

```text
/.well-known/acme-challenge/
```

## 4. Troubleshooting

### `502 Bad Gateway`

```bash
sudo -u deploy pm2 status
sudo -u deploy pm2 logs posspace-web --lines 50
sudo -u deploy pm2 logs posspace-api --lines 50
curl http://127.0.0.1:3001/health
```

### `Cannot find native binding`

```bash
sudo -u deploy rm -rf /var/www/posspace/node_modules
sudo -u deploy npm --prefix /var/www/posspace ci --include=optional
```

Jangan memakai `--omit=optional`; Rolldown membutuhkan binding native Linux
untuk proses build.

### `.env: syntax error`

Cari nilai yang memiliki spasi atau karakter shell seperti `<`, `>`, `#`, `$`,
atau tanda kutip. Nilai tersebut harus dikutip:

```env
SMTP_FROM="posspace <info@posspace.id>"
```

Validasi:

```bash
sudo -u deploy bash -n /var/www/posspace/.env
```

### GitHub Actions gagal login SSH

Periksa:

- `VPS_HOST` benar.
- `VPS_USER` adalah `deploy`.
- `VPS_SSH_KEY` berisi private key lengkap.
- Public key sudah ada di `/home/deploy/.ssh/authorized_keys`.
- Port `22` tidak diblokir firewall.

### `git pull` gagal di VPS

Periksa key VPS ke GitHub dan remote repository:

```bash
sudo -u deploy git -C /var/www/posspace remote -v
sudo -u deploy ssh -T git@github.com
sudo -u deploy git -C /var/www/posspace pull --ff-only origin main
```

## 5. Checklist Go-Live

- [ ] Server Key dan Client Key produksi Midtrans sudah aktif.
- [ ] `MIDTRANS_ENV=production` di `.env` VPS.
- [ ] Notification URL `https://posspace.id/api/payments/midtrans/notification` terdaftar di dashboard Midtrans.
- [ ] Semua `ALLOW_*` dan `ALLOW_OTP_DEBUG` bernilai `false`.
- [ ] `.env` hanya ada di VPS dan permission-nya `600`.
- [ ] Login HTTPS mengembalikan `200`.
- [ ] API dan web online di PM2.
- [ ] GitHub Actions berhasil menjalankan deployment.
- [ ] VPS dapat pull repository dari GitHub.
- [ ] Pembayaran sandbox Midtrans sudah diuji sebelum production.
- [ ] `certbot renew --dry-run` berhasil.
