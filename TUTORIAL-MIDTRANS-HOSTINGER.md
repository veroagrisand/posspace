# Tutorial: Midtrans (Pembayaran) + Email OTP Hostinger untuk posspace

Panduan lengkap mengaktifkan **pembayaran digital via Midtrans** (QRIS, Virtual
Account, e-wallet, kartu kredit) dan **kirim OTP registrasi via email Hostinger
(SMTP)**.

---

## Bagian A — Midtrans Payment Gateway

### A.1 Daftar merchant

1. Buka https://dashboard.sandbox.midtrans.com → **Register** (sandbox gratis,
   verifikasi dokumen usaha menyusul untuk go-live dan pencairan dana).
2. Setelah masuk, buka **Settings → Access Keys** untuk melihat kredensial.

### A.2 Ambil kredensial API

Di menu Access Keys Anda akan melihat:

| Kredensial          | Keterangan                                                     |
| ------------------- | -------------------------------------------------------------- |
| `Server Key`        | Rahasia server — dipakai autentikasi API dan **verifikasi notifikasi (HMAC-SHA512)** |
| `Client Key`        | Kunci publik sisi browser (Snap)                               |

> **Penting:** Server Key/Client Key mode **Sandbox** berbeda dengan mode
> **Production**. Gunakan sandbox untuk pengujian, lalu ganti saat go-live.
> Jangan pernah commit kredensial ke repo publik. Environment dipilih lewat
> variabel `MIDTRANS_ENV`.

### A.3 Isi `.env`

```env
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxxxxxx    # dari dashboard Midtrans → Access Keys
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxxxxxx    # Client Key dari dashboard yang sama
MIDTRANS_ENV=sandbox                              # ganti ke production saat go-live
```

Catatan alur pembayaran yang terpasang:

1. **Langganan toko** → invoice dibuat → link Snap Midtrans dibuat
   (`payment_url`) → pemilik toko dialihkan ke halaman Snap (pilih
   QRIS/VA/e-wallet/kartu) → webhook + polling mengonfirmasi → subscription aktif.
2. **Kasir POS** → pilih QRIS → transaksi dibuat berstatus `pending` (stok
   **belum** dipotong) → QRIS Midtrans (charge langsung, QR tampil di layar)
   atau halaman Snap tampil → pelanggan bayar → webhook/polling konfirmasi PAID
   → stok dipotong otomatis.
3. **Notifikasi** `POST /api/payments/midtrans/notification` diverifikasi dengan
   `signature_key` (**HMAC-SHA512**, server key, `order_id+status_code+gross_amount`)
   dan **idempoten** (pembayaran ganda tidak menggandakan potongan stok).
4. **Polling cadangan** `GET /api/payments/midtrans/status` dipakai jika
   notifikasi tertunda (cek DB dulu, lalu API Midtrans sebagai fallback).

### A.4 Daftarkan notifikasi URL

Masukkan URL notifikasi di dashboard Midtrans
(**Settings → Configuration → Payment Notification URL**):

```
https://domain-anda.com/api/payments/midtrans/notification
```

- Aplikasi harus berjalan di **URL publik (HTTPS)** — VPS + Nginx + certbot
  (lihat `deploy/README.md`).
- Saat pengujian lokal, gunakan tunnel (ngrok / cloudflared / localtunnel) agar
  notifikasi bisa masuk.
- Notifikasi Midtrans berformat JSON; body diverifikasi `signature_key` sebelum
  diproses.

### A.5 Uji coba sandbox

1. Isi `MIDTRANS_SERVER_KEY` + `MIDTRANS_CLIENT_KEY` sandbox di `.env`,
   `MIDTRANS_ENV=sandbox`, restart server.
2. Daftar akun baru di `/register` → setelah OTP, pilih paket → dialihkan ke
   halaman Snap Midtrans sandbox.
3. Selesaikan pembayaran (mode sandbox, kartu uji `4811 1111 1111 1114`) →
   notifikasi masuk → status berubah "Pembayaran diterima" → aplikasi aktif.
4. Coba di kasir: pilih menu → bayar QRIS → QRIS tampil di layar →
   selesaikan di sandbox → stok bahan berkurang, struk muncul.
5. Simulasi notifikasi manual tersedia di dashboard Midtrans
   (Transaction → cari transaksi → kirim ulang notifikasi) atau lewat API
   status (polling di halaman aplikasi).

> Tanpa gateway (Midtrans belum dikonfigurasi), langganan toko dibuat berstatus
> **PENDING** dan pemilik toko **tidak bisa mengaktifkan sendiri**. Aktivasi
> manual dilakukan oleh superadmin di dashboard `/admin/subscriptions`.

Jika gagal, cek log server (`pm2 logs posspace-api`): pesan `Midtrans ... HTTP xxx`
menunjukkan detail dari API Midtrans (biasanya Server Key / `MIDTRANS_ENV` salah,
atau kanal QRIS belum aktif di akun merchant).

---

## Bagian B — Email OTP via Hostinger

### B.1 Buat akun email di Hostinger hPanel

1. Login hPanel (https://hpanel.hostinger.com) → menu **Emails**.
2. Klik **Create New Email Account**.
3. Isi:
   - **Email:** `no-reply@domainanda.id` (atau `info@`)
   - **Password:** buat password kuat.
4. Klik **Create**.

> Pastikan DNS domain sudah mengarah ke Hostinger (MX records). Jika domain
> baru dibeli di Hostinger, ini otomatis.

### B.2 Detail SMTP Hostinger

| Pengaturan | Nilai |
| ---------- | ----- |
| Host       | `smtp.hostinger.com` |
| Port       | `465` (SSL) atau `587` (STARTTLS) |
| Username   | alamat email lengkap, mis. `no-reply@domainanda.id` |
| Password   | password email yang dibuat di hPanel |
| Encryption | SSL/TLS |

### B.3 Isi `.env`

```env
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=no-reply@domainanda.id
SMTP_PASS=password_email_anda
SMTP_FROM="posspace <no-reply@domainanda.id>"
OTP_TTL_MINUTES=10
ALLOW_OTP_DEBUG=false
```

- `SMTP_SECURE=true` untuk port 465; `false` jika memakai port 587.
- `ALLOW_OTP_DEBUG` **WAJIB false di produksi**.

### B.4 Alur OTP yang terpasang

1. `/register` → masukkan email → **Kirim kode verifikasi**.
2. Backend membuat kode **6 digit**, menyimpan hanya hash-nya di tabel
   `otp_codes`, lalu mengirim email via SMTP Hostinger.
3. Masukkan kode → diverifikasi (max 5 percobaan, berlaku 10 menit,
   cooldown kirim ulang 60 detik) → lanjut isi data toko.
4. Registrasi selesai → toko + invoice dibuat → bayar paket (Midtrans).

---

## Bagian C — Checklist Go-Live Produksi

- [ ] `ALLOW_DEMO_MODE=false`, `ALLOW_MOCK_PAYMENT=false`, `ALLOW_MANUAL_ACTIVATION=false`
- [ ] `ALLOW_OTP_DEBUG=false`
- [ ] Kredensial Midtrans **produksi** diisi (`MIDTRANS_ENV=production`)
- [ ] Notification URL Midtrans mengarah ke HTTPS domain Anda
  (`/api/payments/midtrans/notification`)
- [ ] SMTP Hostinger terisi & email OTP terkirim normal
- [ ] Uji alur: register → OTP → pilih paket → bayar Midtrans → aplikasi aktif
- [ ] Uji kasir: menu → QRIS → bayar → stok terpotong → struk
- [ ] Uji webhook: bayar, lalu lihat `transactions.payment_status = paid`