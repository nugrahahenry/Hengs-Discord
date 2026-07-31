# Hengs Community Event Hub

**Version:** 1.8.0
**Status:** Event Draft Editor implemented and automatically verified
**Timezone input:** WIB (`Asia/Jakarta`)

## Product flow

1. Owner atau role `OPS_EDITOR_ROLE_IDS` menjalankan `/event draft`.
2. Hengs menyimpan event sebagai draft lokal dan membuat panel privat di
   `BOT_SETTINGS_CHANNEL_ID`.
3. Owner dan role `OPS_EDITOR_ROLE_IDS` dapat memakai **Edit Detail** untuk judul,
   deskripsi, waktu, dan lokasi, atau **Kapasitas & Sumber** untuk kapasitas dan URL.
4. Hanya `OWNER_ID` yang dapat memilih **Publish Event** atau **Discard**.
5. Event yang disetujui dikirim ke `ANNOUNCE_CHANNEL_ID` dengan tiga tombol RSVP.
6. Anggota dapat memilih **Hadir**, **Mungkin**, atau **Batal RSVP**; pilihan terakhir
   menggantikan pilihan sebelumnya.
7. Owner dapat membatalkan event dari panel privat. Worker menutup RSVP otomatis saat
   waktu event dimulai.

## Draft editor

- Discord membatasi satu modal hingga lima input, jadi enam field event dibagi ke dua
  modal agar tetap mudah dipakai dan tidak mengubah schema slash command.
- Setiap draft memiliki nomor `revision`. Modal menyimpan nomor revisi ketika dibuka;
  submit dari modal lama ditolak jika draft sudah berubah agar edit bersamaan tidak
  saling menimpa.
- Edit hanya berlaku saat status masih `draft`. Event yang sedang dipublikasikan,
  sudah tayang, dibuang, dibatalkan, atau selesai tidak dapat diedit.
- Perubahan disimpan atomik sebelum panel disegarkan. Jika Discord gagal menyegarkan
  panel, state tetap menandai `messageSyncPending` agar startup/worker dapat mencoba
  sinkronisasi lagi dan pengguna mendapat peringatan untuk tidak Publish dahulu.
- Audit hanya mencatat actor, nomor revisi, dan nama field yang berubah; isi judul,
  deskripsi, lokasi, serta URL tidak disalin ke audit.

## Canox intake

- Canox menulis `data/canox-event-inbox.json` melalui temporary file dan atomic rename.
- Inbox event terpisah dari `canox-ops-inbox.json`, sehingga event tidak dapat menimpa
  draft pengumuman.
- Payload maksimal 10 entry dan diproses all-or-nothing. Setiap entry wajib memiliki
  ID unik, judul, deskripsi, dan timestamp masa depan dengan zona waktu.
- Lokasi, kapasitas 2-500, dan URL sumber HTTP(S) tanpa credential bersifat opsional.
- Hengs hanya membuat panel privat berlabel sumber Canox. Publish/Discard tetap memakai
  tombol owner yang sama dengan draft Discord.
- File `processing-*` yang tertinggal akibat crash dipulihkan saat startup. External ID
  membuat pengiriman ulang aman dan tidak menghasilkan panel kedua.

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
- Tombol edit dan submit modal memeriksa ulang owner/`OPS_EDITOR_ROLE_IDS`; tampilan
  tombol tidak dianggap sebagai otorisasi.
- Revision compare-and-set menolak modal kedaluwarsa dan menutup lost-update race.
- Semua event dan reminder menonaktifkan mention parsing.
- RSVP menyimpan user ID lokal untuk menjaga satu pilihan per anggota, tetapi pesan
  publik hanya menampilkan jumlah Hadir/Mungkin.
- Kapasitas 2-500 dan ditegakkan di store sebelum message edit.
- Cancel ditolak sementara reminder sedang dalam state `sending`, sehingga reminder
  tidak dapat terkirim setelah event dibatalkan.
- Isi inbox Canox tidak dapat memilih status, publication channel, RSVP, reminder, atau
  actor final. Field di luar kontrak diabaikan dan mention parsing tetap dinonaktifkan.

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

Live acceptance v1.7.0 lulus: sender produksi Canox mengirim satu structured event
tanpa AI, tepat satu panel berlabel Canox muncul di `bot-settings`, URL referensi
tersimpan, lalu owner menekan Discard. State final `discarded`, publication tetap null,
seluruh tombol hilang, dan tidak ada inbox/processing tersisa. Schema slash command
tidak berubah sehingga tidak ada registrasi command ulang.

Event Draft Editor v1.8.0 diverifikasi otomatis: editor dapat memperbarui kedua modal,
modal palsu dan pengguna tanpa izin ditolak, modal revisi lama tidak dapat overwrite,
editor tetap tidak memperoleh Publish/Discard, event non-draft tidak dapat diedit,
dan panel kembali sinkron setelah penyimpanan. Schema `/event` tetap tidak berubah.
