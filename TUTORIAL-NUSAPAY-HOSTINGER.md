# Tutorial: Nusapay (QRIS) + Email OTP Hostinger untuk posspace

Panduan lengkap mengaktifkan **pembayaran QRIS via Nusapay (SNAP QR MPM)** dan
**kirim OTP registrasi via email Hostinger (SMTP)**.

---

## Bagian A — Nusapay QRIS

### A.1 Daftar merchant (jika belum)

1. Buka [https://merchant.nusapay.co.id](https://merchant.nusapay.co.id) (perorangan) atau
 [https://company-registration.nusapay.co.id](https://company-registration.nusapay.co.id) (perusahaan/PT).
2. Daftar dengan data usaha (nama, NIB, NPWP, rekening, dll).
3. Selesaikan verifikasi dokumen yang diminta Nusapay (biasanya 1–3 hari kerja).

### A.2 Minta aktivasi produk "SNAP QR MPM"

Setelah akun disetujui, hubungi tim Nusapay ([info@nusapay.co.id](mailto:info@nusapay.co.id)) untuk:

- Mengaktifkan produk **SNAP QR MPM** (QRIS dinamis) pada akun merchant Anda.
- Meminta **kredensial API** dan **URL endpoint** (sandbox &amp; produksi).
- Meminta **Postman Collection** "SNAP QR MPM" + contoh **Private Key** format.

Nusapay akan mengirimkan (simpan semua — jangan bocor):


| Kredensial      | Keterangan                                              |
| --------------- | ------------------------------------------------------- |
| `Client ID`     | Pengenal aplikasi/partner (bisa juga disebut partnerId) |
| `Client Secret` | Rahasia untuk header `Authorization` (Basic)            |
| `Merchant ID`   | ID merchant untuk produk QR MPM                         |
| `Private Key`   | RSA private key Anda (untuk tanda tangan X-SIGNATURE)   |
| `Public Key`    | Public key **Nusapay** (untuk verifikasi webhook)       |
| `Base URL`      | URL sandbox (mis. `https://sandbox-api.nusapay.co.id`)  |


> Jika kredensial belum datang, tidak masalah — kode sudah terpasang dan akan
> aktif otomatis begitu `NUSAPAY_CLIENT_ID` dll diisi. Selama belum diisi,
> aplikasi memakai jalur "aktivasi manual" (khusus pengembangan).

### A.3 Isi `.env`

```env
NUSAPAY_CLIENT_ID=isi_dari_nusapay
NUSAPAY_CLIENT_SECRET=isi_dari_nusapay
NUSAPAY_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
NUSAPAY_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
NUSAPAY_MERCHANT_ID=isi_dari_nusapay
NUSAPAY_PARTNER_ID=isi_dari_nusapay      # jika berbeda dari Client ID
NUSAPAY_ACCESS_TOKEN=                     # umumnya kosong
NUSAPAY_BASE_URL=https://sandbox-api.nusapay.co.id   # ganti ke URL yang diberikan
```

Catatan key:

- Bisa berupa **string PEM** (pakai tanda kutip, `\n` untuk baris baru) **atau path file**
seperti `/etc/posspace/nusapay-private.pem`.
- `NUSAPAY_PUBLIC_KEY` wajib diisi agar webhook callback diverifikasi — tanpa ini
callback ditolak dan pembayaran hanya dikonfirmasi lewat polling.

### A.4 Pastikan callback URL dapat diakses publik

Webhook Nusapay akan memanggil:

```
https://domain-anda.com/api/payments/nusapay/callback
```

Persyaratan:

- Aplikasi harus **berjalan di URL publik (HTTPS)** — mis. VPS + Nginx.
- Saat pengujian lokal bisa gunakan tunnel (ngrok / cloudflared / localtunnel)
lalu set `PUBLIC` URL ke Nusapay.
- Nusapay perlu **mendaftarkan callback URL** tersebut di dashboard merchant
(atau dikirim via tim support) sesuai ketentuan produk SNAP QR MPM.

### A.5 Alur yang terpasang di aplikasi

1. **Langganan toko** → invoice dibuat → QRIS dinamis Nusapay langsung tampil
 di halaman `/subscribe` (pindai QR → bayar → polling otomatis).
2. **Kasir POS** → pilih QRIS → transaksi dibuat berstatus `pending` (stok
 **belum** dipotong) → QRIS tampil → pelanggan bayar →
 webhook/polling konfirmasi PAID → stok dipotong otomatis sesuai resep (BOM).
3. **Webhook** `POST /api/payments/nusapay/callback` diverifikasi
 (RSA-SHA256 + anti-replay 10 menit) dan **idempoten** (pembayaran ganda
 tidak menggandakan potongan stok).
4. **Polling cadangan** `GET /api/payments/nusapay/status` dipakai jika callback
 tertunda.

### A.6 Uji coba sandbox

1. Isi semua `NUSAPAY_*` di `.env` dengan kredensial sandbox.
2. Restart server (`npm run dev`).
3. Daftar akun baru di `/register` → setelah OTP, pilih paket →
 QRIS Nusapay muncul di `/subscribe`.
4. Bayar dengan aplikasi Nusapay (mode sandbox) → status berubah "Pembayaran
 diterima" → aplikasi aktif.
5. Coba di kasir: pilih menu → bayar QRIS → pindai dengan app sandbox →
 stok bahan berkurang, struk muncul.

> Tanpa gateway (Nusapay/Duitku belum aktif), langganan toko dibuat berstatus
> **PENDING** dan pemilik toko **tidak bisa mengaktifkan sendiri**. Aktivasi
> manual dilakukan oleh superadmin di dashboard `/admin/subscriptions`
> (tombol "Aktifkan" / "Perpanjang" / "Batalkan").

Jika gagal, cek log server: pesan `Nusapay ... HTTP xxx` menunjukkan detail
dari API Nusapay (biasanya signature / base URL / merchantId salah).

---

## Bagian B — Email OTP via Hostinger

### B.1 Buat akun email di Hostinger hPanel

1. Login hPanel ([https://hpanel.hostinger.com](https://hpanel.hostinger.com)) → menu **Emails**.
2. Klik **Create New Email Account** (di bawah "Email accounts").
3. Isi:
  - **Email:** `no-reply@domainanda.id` (atau `info@`, `otp@`)
  - **Password:** buat password kuat (Anda tidak akan melihatnya lagi).
  - **Mailbox storage:** bebas (default cukup).
4. Klik **Create**.

> Catatan: agar email bisa dikirim, pastikan DNS domain sudah mengarah ke
> Hostinger (MX records). Jika domain baru dibeli di Hostinger, ini otomatis.

### B.2 Detail SMTP Hostinger


| Pengaturan | Nilai                                               |
| ---------- | --------------------------------------------------- |
| Host       | `smtp.hostinger.com`                                |
| Port       | `465` (SSL) atau `587` (STARTTLS)                   |
| Username   | alamat email lengkap, mis. `no-reply@domainanda.id` |
| Password   | password email yang dibuat di hPanel                |
| Encryption | SSL/TLS                                             |


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
- `OTP_TTL_MINUTES=10` → kode berlaku 10 menit (sesuai pilihan Anda).
- `ALLOW_OTP_DEBUG` **WAJIB false di produksi**. Saat true, kode OTP ikut
dikembalikan API (hanya untuk uji lokal tanpa email).

### B.4 Alur OTP yang terpasang

1. `/register` → masukkan email → **Kirim kode verifikasi**.
2. Server membuat kode **6 digit**, menyimpan hanya hash-nya di tabel
 `otp_codes`, lalu mengirim email via SMTP Hostinger.
3. Email tiba dalam beberapa detik (cek folder Spam bila tidak ada).
4. Masukkan kode → diverifikasi (max 5 percobaan, berlaku 10 menit,
 cooldown kirim ulang 60 detik) → lanjut isi data toko.
5. Registrasi selesai → toko + invoice dibuat → bayar paket (Nusapay).

### B.5 Uji coba OTP

1. Isi `SMTP_*` di `.env` lalu restart server.
2. Buka `/register`, kirim kode ke email Anda, periksa inbox.
3. Jika email tidak sampai: cek Spam, pastikan `SMTP_PASS` benar, dan
 coba `SMTP_PORT=587` + `SMTP_SECURE=false`.
4. Untuk uji cepat tanpa email sungguhan (lokal saja):
 `ALLOW_OTP_DEBUG=true` — kode ditampilkan langsung di halaman.

---

## Bagian C — Checklist Go-Live Produksi

- [ ] `ALLOW_DEMO_MODE=false`, `ALLOW_MOCK_PAYMENT=false`, `ALLOW_MANUAL_ACTIVATION=false`
- [ ] `ALLOW_OTP_DEBUG=false`
- [ ] Kredensial Nusapay **produksi** diisi &amp; base URL produksi
- [ ] Callback URL Nusapay mengarah ke HTTPS domain Anda
- [ ] SMTP Hostinger terisi &amp; email OTP terkirim normal
- [ ] Uji alur: register → OTP → pilih paket → QRIS → bayar → aplikasi aktif
- [ ] Uji kasir: menu → QRIS → bayar → stok terpotong → struk
- [ ] Uji webhook: bayar, lalu lihat `transactions.payment_status = paid`
