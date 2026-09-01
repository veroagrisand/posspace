# posspace

POS kasir untuk UMKM coffee shop Indonesia — pencatatan pesanan cepat, stok gudang
terpotong otomatis sesuai resep (BOM), dan laporan HPP dalam satu aplikasi.

- Frontend: [SvelteKit](https://svelte.dev) (SSR + SPA)
- Backend: [Hono](https://hono.dev) gateway (microservices) + [Supabase](https://supabase.com)
  (PostgreSQL, Auth, RLS)
- Pembayaran digital: iPaymu (QRIS / VA / e-wallet)
- Deploy: VPS Hostinger via GitHub Actions (auto-deploy)

---

## 1. Arsitektur

```
Browser ── HTTPS ──▶ Nginx (TLS, VPS)
                        │
                        ▼
              SvelteKit web :3000  ── proxy /api/* ──▶ Hono gateway :3001
                        │                                   │
                        ▼                                   ▼
                 Supabase (Postgres + Auth + RLS)   iPaymu · SMTP (OTP)
```

- **Frontend tidak memegang logika bisnis** — semua operasi diteruskan lewat
  `src/routes/api/[...path]/+server.ts` (BFF) ke gateway.
- **Gateway** (`apps/api`) memuat service per domain:
  `auth`, `data` (POS), `transactions`, `reports`, `payments`, `shop`, `subscription`,
  `cms`, `admin`.
- **Database**: RLS aktif di semua tabel; operasi atomik (transaksi, potong stok,
  opname, shift) lewat fungsi `SECURITY DEFINER` yang disimpan di **schema `private`**
  (tidak diekspos PostgREST) — lihat migration `0013_security_definer_permissions.sql`.

## 2. Struktur direktori

```
apps/api/src/          Gateway Hono (service per domain, guard otorisasi)
deploy/                Skrip deploy VPS, Nginx, ecosystem PM2, Dockerfile
scripts/               Verifikasi & e2e (jalankan untuk QA)
src/lib/components/    Komponen Svelte bersama (nav/footer publik, shell kebijakan)
src/lib/css/           base.css (token global) · brand.css (desain publik)
src/lib/server/        Guard SSR (platform admin, sesi)
src/routes/            Halaman: landing, auth, app (POS), admin, kebijakan
supabase/migrations/   Migrasi database berurutan (0001–0013)
```

## 3. Pengembangan lokal

Prasyarat: Node.js ≥ 22, npm, dan satu project Supabase (link via `supabase link`).

```bash
npm install                 # workspace: root + apps/api
cp .env.example .env        # isi kredensial (lihat §4)
supabase link --project-ref <ref>
supabase db push --linked   # terapkan migration
```

Jalankan dua proses (dua terminal):

```bash
npm run dev        # web SvelteKit → http://localhost:5173
npm run dev:api    # gateway Hono  → http://127.0.0.1:3001
```

- Semua `/api/*` di frontend otomatis diproxy ke gateway (lihat `API_UPSTREAM`).
- Verifikasi cepat: `npm run check` (svelte-check) dan `npm run build:api` (tsc).
- Mode demo tanpa Supabase hanya jika `ALLOW_DEMO_MODE=true` dan Supabase tidak dikonfigurasi.

## 4. Variabel lingkungan

Salin `.env.example` ke `.env`. Variabel penting:

| Variabel | Keterangan |
|---|---|
| `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY` | Dikirim ke browser (anon key publik) |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Rahasia server; **service role hanya untuk backend** |
| `IPAYMU_VA` / `IPAYMU_API_KEY` / `IPAYMU_BASE_URL` | Gateway pembayaran (sandbox vs produksi berbeda) |
| `SMTP_*` / `OTP_TTL_MINUTES` | Email OTP registrasi (SMTP Hostinger) |
| `ALLOW_OTP_DEBUG` / `ALLOW_DEMO_MODE` / `ALLOW_MOCK_PAYMENT` / `ALLOW_MANUAL_ACTIVATION` | Mode pengembangan — **WAJIB `false` di produksi** |
| `API_UPSTREAM` | Alamat internal gateway (default `http://127.0.0.1:3001`) |

> Jangan pernah commit `.env`, service role key, API key, atau private key ke repo.
> Secret GitHub yang dipakai workflow: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`
> (`VPS_SSH_KEY` harus Repository **Secret**, bukan Variable).

## 5. Pengujian / QA

Tidak ada framework unit di repo; verifikasi dilakukan lewat skrip e2e/keamanan di
`scripts/` yang memakai Supabase project ter-link dan server dev di `localhost:5173`:

```bash
npm run dev       # terminal 1
npm run dev:api   # terminal 2
node scripts/e2e-backend.mjs        # alur inti: daftar → subscribe → transaksi → stok → RLS
node scripts/verify-payments.mjs    # transaksi pending → confirm (idempoten) → webhook
node scripts/verify-security.mjs    # validasi input, IDOR, rate limit OTP, header
node scripts/verify-admin.mjs       # RLS platform admin + HPP
node scripts/smoke-admin.mjs        # dashboard admin + hapus toko dgn transaksi berbayar
node scripts/verify-admin-subs.mjs  # aktivasi/perpanjang/batal langganan
node scripts/verify-menu.mjs        # CRUD menu + cascade varian/resep
node scripts/verify-menu-rls.mjs    # RLS menu (user tanpa toko → 403)
```

Skrip membuat data uji sementara (user/toko) di project Supabase yang ter-link,
lalu membersihkannya. Pastikan Anda menjalankannya di environment yang memang
untuk pengujian.

Panduan pentest manual (OWASP API Security Top 10 2023) yang dipakai sebagai
acuan pengujian produksi: lintas-tenant BOLA/IDOR, function-level authorization,
mass assignment, RPC PostgREST (schema `private`), info disclosure, dan retest
setelah perbaikan.

## 6. Keamanan & konvensi

Prinsip yang wajib dijaga saat menambah fitur:

- **RLS adalah garis pertahanan terakhir.** Selalu buat policy per toko
  (`shop_id = auth_shop_id()`) dan jangan andalkan guard API saja.
- **Fungsi SQL yang membutuhkan hak lebih** (`SECURITY DEFINER`) diletakkan di
  schema `private`, dan hanya RPC publik sebagai wrapper `SECURITY INVOKER`
  dengan `GRANT` minimum (anon/authenticated/service_role). Perbarui grant
  `private.*` di migration jika menambah fungsi baru.
- **Error RLS** (`permission denied` / `row-level security`) harus dipetakan ke
  `403 FORBIDDEN`, bukan `500`. Contoh: helper `rlsDenied()` di `apps/api/src/services/pos.ts`.
- **Validasi input di gateway** (harga ≥ 0, qty > 0, unit ∈ `gram|ml|pcs`,
  min_stock ≥ 0) sebelum menyentuh database.
- **Operasi berkuota** (mis. `used_count` voucher) memakai update CAS atomik,
  bukan read-then-write.
- **Jangan** menambahkan `http2 on;` di Nginx (tidak dikenal nginx 1.24 —
  gunakan `listen 443 ssl http2;`), dan **jangan** menyetel `HOST` pada
  `posspace-web` (mode cluster Node butuh wildcard bind).
- Security headers (CSP, HSTS, X-Frame-Options, COOP, Referrer-Policy) dipasang
  di `src/hooks.server.ts` — jangan dilepas.

## 7. Deployment

- **Auto-deploy**: push ke `main` → GitHub Actions SSH ke VPS → `deploy/deploy.sh`
  (pull → `npm ci` → build api+web → `pm2 reload` → health check).
- Konfigurasi VPS, Nginx, dan panduan provisioning ada di `deploy/README.md`
  dan `PANDUAN-IPAYMU-AUTO-DEPLOY.md`.
- **Migrasi database**: jalankan `supabase db push --linked` (atau terapkan saat
  deploy) — daftar status: `supabase migration list --linked`.
- **Nginx**: perubahan `deploy/nginx.conf` perlu diterapkan manual sekali di VPS:

  ```bash
  sudo install -m 644 /var/www/posspace/deploy/nginx.conf /etc/nginx/sites-available/posspace
  sudo install -m 644 /var/www/posspace/deploy/nginx.conf /etc/nginx/sites-enabled/posspace
  sudo nginx -t && sudo systemctl reload nginx
  ```

- Rollback: `bash deploy/deploy.sh --rollback` di VPS (kembali ke commit sukses terakhir).

## 8. Troubleshooting singkat

| Gejala | Penyebab / solusi |
|---|---|
| `API_UNAVAILABLE` | Gateway `:3001` mati saat reload — cek `pm2 status`, `curl 127.0.0.1:3001/health` |
| 502 sesaat saat deploy | Jendela reload PM2 — sudah diredam `proxy_next_upstream` di Nginx |
| `Cannot find native binding` (Rolldown) | `npm ci` melewatkan optional dep Linux — `deploy.sh` memasangnya otomatis |
| `permission denied for function ...` | Grant RPC belum sesuai migration `0013` — samakan `GRANT/REVOKE` |
| Login/daftar gagal OTP | Cek `SMTP_*`; dev: `ALLOW_OTP_DEBUG=true` mengembalikan kode di respons |

---

Dokumen pendukung: `posspace-PRD.md` (spesifikasi produk), `deploy/README.md`
(ops VPS + auto-deploy), `PANDUAN-IPAYMU-AUTO-DEPLOY.md` (iPaymu produksi).