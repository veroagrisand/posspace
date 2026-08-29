# Tutorial: iPaymu (Pembayaran) + Email OTP Hostinger untuk posspace

Panduan lengkap mengaktifkan **pembayaran digital via iPaymu** (QRIS, Virtual
Account, e-wallet) dan **kirim OTP registrasi via email Hostinger (SMTP)**.

---

## Bagian A — iPaymu Payment Gateway

### A.1 Daftar merchant

1. Buka https://my.ipaymu.com → **Register** (gratis, verifikasi instan untuk
   pendaftaran; dokumen usaha menyusul untuk pencairan dana).
2. Setelah masuk, buka menu **Integrasi** (https://my.ipaymu.com/integration).

### A.2 Ambil kredensial API

Di menu Integrasi Anda akan melihat:

| Kredensial     | Keterangan                                                     |
| -------------- | -------------------------------------------------------------- |
| `VA`           | Virtual Account merchant Anda — dipakai sebagai header `va` dan **secret key verifikasi callback** |
| `API Key`      | Dipakai membuat signature HMAC-SHA256                          |

> **Penting:** VA & API Key mode **Sandbox/Development** berbeda dengan mode
> **Production/Live**. Gunakan sandbox untuk pengujian, lalu ganti saat go-live.
> Jangan pernah commit kredensial ke repo publik.

### A.3 Isi `.env`

```env
IPAYMU_VA=1179xxxxxx                  # dari dashboard iPaymu → Integrasi
IPAYMU_API_KEY=xxxxxxxxxxxx.xxxxx     # API Key dari dashboard yang sama
IPAYMU_BASE_URL=https://sandbox.ipaymu.com   # ganti ke https://my.ipaymu.com saat produksi
```

Catatan alur pembayaran yang terpasang:

1. **Langganan toko** → invoice dibuat → link pembayaran iPaymu dibuat
   (`payment_url`) → pemilik toko dialihkan ke halaman pembayaran iPaymu
   (pilih QRIS/VA/e-wallet) → webhook + polling mengonfirmasi → subscription aktif.
2. **Kasir POS** → pilih QRIS → transaksi dibuat berstatus `pending` (stok
   **belum** dipotong) → QRIS iPaymu (atau halaman pembayaran) tampil →
   pelanggan bayar → webhook/polling konfirmasi PAID → stok dipotong otomatis.
3. **Callback** `POST /api/payments/ipaymu/callback` diverifikasi dengan
   signature **HMAC-SHA256** (secret = VA, sortir key A-Z, escape slash) dan
   **idempoten** (pembayaran ganda tidak menggandakan potongan stok).
4. **Polling cadangan** `GET /api/payments/ipaymu/status` dipakai jika callback
   tertunda (cek DB dulu, lalu API iPaymu sebagai fallback).

### A.4 Pastikan callback URL dapat diakses publik

Webhook iPaymu akan memanggil URL yang dikirim di `notifyUrl`:

```
https://domain-anda.com/api/payments/ipaymu/callback
```

- Aplikasi harus berjalan di **URL publik (HTTPS)** — VPS + Nginx + certbot
  (lihat `deploy/README.md`).
- Saat pengujian lokal, gunakan tunnel (ngrok / cloudflared / localtunnel) agar
  callback bisa masuk.
- Format callback (form-urlencoded atau JSON) bisa diatur di dashboard iPaymu
  (Integrasi → Setting). Keduanya didukung kode ini.

### A.5 Uji coba sandbox

1. Isi `IPAYMU_VA` + `IPAYMU_API_KEY` sandbox di `.env`, restart server.
2. Daftar akun baru di `/register` → setelah OTP, pilih paket → dialihkan ke
   halaman pembayaran iPaymu sandbox.
3. Selesaikan pembayaran (mode sandbox) → callback masuk → status berubah
   "Pembayaran diterima" → aplikasi aktif.
4. Coba di kasir: pilih menu → bayar QRIS → selesaikan di sandbox →
   stok bahan berkurang, struk muncul.
5. Simulasi callback manual tersedia di https://sandbox.ipaymu.com/notify
   (isi Transaction ID / Merchant Ref ID lalu pilih status).

> Tanpa gateway (iPaymu belum dikonfigurasi), langganan toko dibuat berstatus
> **PENDING** dan pemilik toko **tidak bisa mengaktifkan sendiri**. Aktivasi
> manual dilakukan oleh superadmin di dashboard `/admin/subscriptions`.

Jika gagal, cek log server (`pm2 logs posspace-api`): pesan `iPaymu ... HTTP xxx`
menunjukkan detail dari API iPaymu (biasanya VA/API Key/base URL salah).

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
4. Registrasi selesai → toko + invoice dibuat → bayar paket (iPaymu).

---

## Bagian C — Checklist Go-Live Produksi

- [ ] `ALLOW_DEMO_MODE=false`, `ALLOW_MOCK_PAYMENT=false`, `ALLOW_MANUAL_ACTIVATION=false`
- [ ] `ALLOW_OTP_DEBUG=false`
- [ ] Kredensial iPaymu **produksi** diisi (`IPAYMU_BASE_URL=https://my.ipaymu.com`)
- [ ] Callback URL iPaymu mengarah ke HTTPS domain Anda (otomatis via `notifyUrl`)
- [ ] SMTP Hostinger terisi & email OTP terkirim normal
- [ ] Uji alur: register → OTP → pilih paket → bayar iPaymu → aplikasi aktif
- [ ] Uji kasir: menu → QRIS → bayar → stok terpotong → struk
- [ ] Uji webhook: bayar, lalu lihat `transactions.payment_status = paid`
