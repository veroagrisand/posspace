# Deploy posspace — VPS Hostinger + Auto-Deploy

Dokumen lengkap: arsitektur, provisioning **VPS fresh**, dan **auto-deploy**
(setiap push ke `main` otomatis ter-deploy).

---

## 1. Arsitektur

```
GitHub (repo) ──push main──▶ GitHub Actions ──SSH (deploy key)──▶ VPS Hostinger
                                                                        │
Browser ─▶ Nginx (TLS/gzip/cache) ─▶ web :3000 (SvelteKit)            │
                                        │ proxy /api/*                 │
                                        ▼                             │
                                   api :3001 (Hono gateway)           │
                                        │                              │
                                        ▼                              │
                        Supabase · iPaymu · SMTP Hostinger             │
                                                                       ▼
                              PM2: posspace-web (cluster×2) + posspace-api
```

- `src/` = frontend (SvelteKit). `apps/api/` = backend microservices (Hono).
- Semua build dilakukan **di VPS** (workflow hanya memicu lewat SSH) —
  sederhana, tanpa transfer artefak, dan `.env` tidak pernah keluar server.

---

## 2. Satu kali: provisioning VPS fresh

**Prasyarat:** VPS Hostinger (Ubuntu 22.04/24.04, ≥1 vCPU/1GB, IP publik),
domain sudah diarahkan (A record → IP VPS), repo sudah ada di GitHub.

Masuk ke VPS lalu jalankan satu perintah:

```bash
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/NAMA_AKUN/posspace/main/deploy/init-server.sh)" \
    DOMAIN=posspace.id \
    GIT_REPO=git@github.com:NAMA_AKUN/posspace.git \
    ADMIN_EMAIL=admin@posspace.id
```

Atau jika repo sudah dikloning di VPS: `sudo bash deploy/init-server.sh DOMAIN=... GIT_REPO=...`

Skrip ini (idempotent, aman diulang) melakukan:

| # | Langkah |
|---|---------|
| 1 | Update sistem + paket dasar (curl, git, build-essential, ufw, nginx) |
| 2 | Node.js 22 LTS (NodeSource) |
| 3 | PM2 global |
| 4 | User `deploy` (sudo) |
| 5 | Direktori `/var/www/posspace` + `/var/log/posspace` |
| 6 | Clone repo & checkout branch `main` |
| 7 | Salin `.env.example` → `.env` — **Anda mengisi kredensial di sini** (Supabase, iPaymu, SMTP; `ALLOW_*` = false) |
| 8 | Nginx reverse proxy (dari `deploy/nginx.conf`, domain di-substitusi) |
| 9 | Firewall ufw: hanya 22/80/443 |
| 10 | TLS Let's Encrypt (certbot) — otomatis redirect HTTPS |
| 11 | Deploy pertama (build + PM2 reload + health check) |
| 12 | PM2 startup (auto-restart saat reboot) |

Parameter opsional: `GIT_BRANCH`, `SKIP_SSL=1` (pasang TLS manual nanti),
`APP_USER`, `APP_DIR`.

> Catatan: jika repo privat, buat **GitHub Deploy Key** untuk akses clone dari
> VPS, atau gunakan HTTPS + Personal Access Token pada URL repo.

---

## 3. Auto-deploy (GitHub Actions → VPS)

### 3.1 Buat SSH deploy key (di mesin lokal — sekali)

```bash
bash deploy/setup-auto-deploy.sh
```

Skrip ini: membuat `~/.ssh/posspace_deploy` (ed25519), lalu mencetak:

1. Perintah memasang **public key** di VPS:
   ```bash
   ssh-copy-id -i ~/.ssh/posspace_deploy deploy@IP_VPS
   ```
   Uji: `ssh -i ~/.ssh/posspace_deploy deploy@IP_VPS 'echo OK'`

2. **Secrets GitHub** (repo → Settings → Secrets and variables → Actions):

   | Secret | Nilai |
   |--------|-------|
   | `VPS_HOST` | IP atau domain VPS |
   | `VPS_USER` | `deploy` |
   | `VPS_SSH_KEY` | isi file private `~/.ssh/posspace_deploy` (mulai `-----BEGIN OPENSSH...`) |

   Variabel (Settings → Variables): `VPS_PORT` (default 22), `VPS_PATH` (default `/var/www/posspace`).

3. Opsional — **forced command** agar key SSH hanya bisa memicu deploy:
   tambahkan `restrict,command="/var/www/posspace/deploy/auto-deploy.sh"` di depan
   public key pada `/home/deploy/.ssh/authorized_keys`.

### 3.2 Workflow

`.github/workflows/deploy.yml` sudah tersedia di repo:

- **Trigger:** push ke `main` + manual (`workflow_dispatch`).
- **Alur:** SSH → `bash deploy/deploy.sh` (pull → npm ci → build api+web →
  pm2 reload → health check).
- **Keamanan:** concurrency group mencegah tumpang-tindih; deploy.sh memegang
  file lock (`deploy.lock`) sehingga deploy manual + auto tidak bentrok.

Setelah secrets terisi, cukup **push ke main**:

```bash
git push origin main
```

Pantau: tab **Actions** di GitHub → run "Auto Deploy ke VPS".

---

## 4. Deploy manual / rollback

```bash
# di VPS
cd /var/www/posspace
bash deploy/deploy.sh            # deploy commit saat ini (juga auto-pull)
bash deploy/deploy.sh --rollback # kembali ke commit terakhir yang sukses
```

`deploy.sh` selalu: cek `.env` → lock → git pull (ff-only) → npm ci →
build backend + frontend → `pm2 reload` (env dari `.env`) → **health check**
(API `/health` + halaman `/login`) → simpan commit sukses di `.last-release`.

Jika health check gagal, skrip menampilkan 40 baris log PM2 terakhir dan
keluar dengan status error (workflow GitHub akan tampil merah).

---

## 5. Monitoring & log

```bash
pm2 status                 # dua proses: posspace-web, posspace-api
pm2 logs posspace-web      # log frontend
pm2 logs posspace-api      # log backend (OTP, iPaymu, error)
pm2 monit                  # dashboard CPU/RAM real-time
tail -f /var/log/nginx/access.log
```

- Access log aplikasi → dashboard `/admin/monitor` (tabel, grafik, ekspor CSV).
- `pm2 save` + `pm2 startup` sudah dikonfigurasi oleh init-server.sh —
  proses hidup kembali otomatis setelah reboot.

---

## 6. Troubleshooting

| Gejala | Solusi |
|--------|--------|
| Workflow merah "Deploy sedang berjalan" | Deploy lain sedang jalan — tunggu; atau hapus `deploy.lock` di VPS bila macet |
| `ERROR: .env belum ada` | Jalankan `init-server.sh`, atau `cp .env.example .env` + isi di VPS |
| Nginx 502 Bad Gateway | `pm2 status` — pastikan dua proses online; cek `pm2 logs posspace-web` |
| Halaman loading terus / API 503 `API_UNAVAILABLE` | Gateway mati: `pm2 restart posspace-api`; cek `curl 127.0.0.1:3001/health` |
| Certbot gagal | Domain belum mengarah ke VPS (A record). Cek `dig A domain` |
| `git pull` menolak (local changes) | Jangan edit file di `/var/www/posspace` langsung; jika terlanjur: `git reset --hard origin/main` |
| `.env` tidak terbaca (karakter khusus) | Beri tanda kutip pada nilai yang mengandung `#`/spasi |
| Port 3001 terbuka ke publik? | Seharusnya TIDAK — ufw hanya 22/80/443; Nginx hanya mem-proxy ke 3000 |

---

## 7. Checklist keamanan go-live

- [ ] `ALLOW_DEMO_MODE=false`, `ALLOW_MOCK_PAYMENT=false`, `ALLOW_MANUAL_ACTIVATION=false`, `ALLOW_OTP_DEBUG=false`
- [ ] iPaymu produksi: `IPAYMU_VA`, `IPAYMU_API_KEY`, `IPAYMU_BASE_URL=https://my.ipaymu.com`
- [ ] SSH root dinonaktifkan (`PermitRootLogin no`) — masuk via user `deploy`/sudo
- [ ] Password SSH dinonaktifkan (`PasswordAuthentication no`) — hanya key
- [ ] Deploy key GitHub diberi forced command (`auto-deploy.sh`)
- [ ] Secrets GitHub tidak pernah dipakai di kode/README
- [ ] Cadangan database Supabase aktif (dashboard Supabase → Backups)