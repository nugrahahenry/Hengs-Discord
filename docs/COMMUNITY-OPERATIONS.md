# Hengs Community Operations Dashboard

## Tujuan

`/ops overview` memberi owner dan editor Ops Hub satu tampilan privat untuk memeriksa
keadaan operasional Hengs tanpa membuka file runtime secara manual. Dashboard bersifat
read-only: tidak ada publish, cancel, restart, atau perubahan mode yang dijalankan.

## Akses

- `OWNER_ID` selalu diizinkan.
- Role dalam `OPS_EDITOR_ROLE_IDS` diizinkan.
- Discord `Manage Messages` hanya mengatur visibilitas default command. Otorisasi
  sebenarnya tetap diperiksa ulang oleh Hengs saat command dijalankan.
- Respons selalu ephemeral dan mention parsing dinonaktifkan.

## Data yang ditampilkan

- Runtime: status koneksi, versi, uptime, dan kode issue allowlist terakhir.
- Ops Hub: jumlah draft review, revisi, jadwal, dan publish yang sedang diproses.
- Event Hub: jumlah draft, publish yang sedang diproses, dan event aktif.
- Penerjemah: configured/tidak, job aktif, antrean, dan kapasitas.
- Mode fokus: nonaktif, belajar, atau scrim beserta durasinya.

## Batas privasi

Dashboard tidak boleh menampilkan atau menyimpan:

- isi/judul draft dan event;
- identitas atau daftar RSVP anggota;
- nama atau isi dokumen;
- topik mode fokus;
- token, API key, path lokal, raw exception, atau stack trace.

Setiap modul hanya mengembalikan angka agregat dan enum yang sudah dibatasi. Error
internal diubah menjadi kode bagian seperti `OPS_UNAVAILABLE`, bukan pesan error asli.

## Degradasi aman

Kegagalan satu sumber tidak menggagalkan seluruh command. Bagian itu tampil dengan
nilai aman dan footer menyebut kode sumber yang tidak tersedia. Dashboard tidak mencoba
memperbaiki, menghapus, atau menulis ulang state yang rusak.

## Operasional

Checkpoint ini menambah subcommand `/ops overview`, sehingga registrasi slash command
perlu dijalankan sekali setelah review dan dengan izin owner. Tidak ada dependency baru
dan tidak ada migrasi state.
