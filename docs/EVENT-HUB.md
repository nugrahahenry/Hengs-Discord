# Hengs Community Event Hub

**Version:** 1.6.0  
**Status:** Live acceptance passed  
**Timezone input:** WIB (`Asia/Jakarta`)

## Product flow

1. Owner atau role `OPS_EDITOR_ROLE_IDS` menjalankan `/event draft`.
2. Hengs menyimpan event sebagai draft lokal dan membuat panel privat di
   `BOT_SETTINGS_CHANNEL_ID`.
3. Hanya `OWNER_ID` yang dapat memilih **Publish Event** atau **Discard**.
4. Event yang disetujui dikirim ke `ANNOUNCE_CHANNEL_ID` dengan tiga tombol RSVP.
5. Anggota dapat memilih **Hadir**, **Mungkin**, atau **Batal RSVP**; pilihan terakhir
   menggantikan pilihan sebelumnya.
6. Owner dapat membatalkan event dari panel privat. Worker menutup RSVP otomatis saat
   waktu event dimulai.

## Reminder

- Reminder 24 jam dikirim sekali ketika sisa waktu berada di antara 24 jam dan 1 jam.
- Reminder 1 jam dikirim sekali ketika sisa waktu kurang dari atau sama dengan 1 jam.
- Event yang dibuat langsung di dalam window 1 jam hanya mendapat reminder 1 jam.
- Reminder tidak memakai mention dan menyertakan tautan kembali ke pesan RSVP.

## Persistence and recovery

State privat disimpan atomik di `data/events-state.json` dan diabaikan Git. Event
memakai ID acak 16 hex dan external interaction ID untuk mencegah duplicate create.
Transisi `draft -> publishing -> published` diklaim sebelum network I/O sehingga dua
klik Publish tidak dapat mengirim event ganda.

Pesan publik membawa marker Event ID. Jika proses mati setelah Discord menerima pesan
tetapi sebelum state lokal selesai, startup mencari marker tersebut dan memfinalisasi
publication tanpa mengirim ulang. Reminder memakai marker serupa. Setiap perubahan
yang belum selesai mengedit panel/pesan publik menandai `messageSyncPending`; startup
hanya memperbaiki event bertanda ini agar tidak mengedit seluruh arsip.

## Security and privacy

- Publish, Discard, dan Cancel selalu memeriksa `OWNER_ID` saat tombol ditekan.
- Semua event dan reminder menonaktifkan mention parsing.
- RSVP menyimpan user ID lokal untuk menjaga satu pilihan per anggota, tetapi pesan
  publik hanya menampilkan jumlah Hadir/Mungkin.
- Kapasitas 2-500 dan ditegakkan di store sebelum message edit.
- Cancel ditolak sementara reminder sedang dalam state `sending`, sehingga reminder
  tidak dapat terkirim setelah event dibatalkan.

## Verification

```bash
npm test
npm run verify:server
```

Registrasi `/event` membutuhkan `npm run deploy` dan tetap dilakukan hanya setelah
izin owner. Live acceptance minimum: draft -> Discard, draft -> Publish, RSVP dari dua
akun, ganti pilihan, Cancel, lalu cek `/event status`.

Live acceptance 2026-07-31 lulus untuk alur produksi utama: Publish menghasilkan satu
pesan publik, RSVP Hadir tercatat 1/2, reminder satu jam terkirim tepat sekali, dan
Cancel owner menghapus seluruh tombol dari panel privat maupun pesan publik. Percobaan
awal juga menemukan draft yang dipublikasikan setelah waktu mulai; publish sekarang
ditolak oleh validasi UI dan atomic claim, dengan regression test khusus. Pengujian
kapasitas serentak dua akun tetap ditutup oleh unit test atomik karena hanya satu akun
Discord manusia yang tersedia saat acceptance.
