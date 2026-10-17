# Hengs Community Operations Dashboard

## Kartu apresiasi v1.61.0 (cloud-live, 2026-10-17)

Deployment dan dua heartbeat sehat sudah lulus. Form/picker memiliki tes offline;
dogfooding interaksi anggota dilakukan di `bot-commands`, bukan dengan ping percobaan.

Tulis `bikin kartu apresiasi` lewat mention Hengs atau `/hengs ask` di server utama. Form
khusus peminta tersedia untuk owner/editor Ops, bukan Administrator tanpa role editor.
Isi penerima (80 karakter), pencapaian (220), acara opsional (100), tanggal opsional (48),
serta pemain opsional (480 total, maksimal 8, masing-masing 60 termasuk nickname).
Pemain satu per baris, contoh `Raka (Sky)` atau `Dara`. Semua fakta berasal dari pengguna.
Form memeriksa kembali home guild, peminta dan akses editor saat dibuka maupun dikirim.

Alternatif langsung: `bikin apresiasi Tim Orion karena juara 1 turnamen kampus; tanggal
17 Oktober 2026; pemain Raka (Sky), Dara`. Hengs tidak mengubah hasil yang sudah terjadi
menjadi jadwal event. Tidak perlu provider/model untuk membangun template atau gambar.

Draft menggunakan announcement Ops biasa, format state tidak berubah. Review ada di
`bot-settings`; owner memutuskan Publish Now, jadwal atau Discard melalui kontrol existing.
Tidak membuat channel, role, poin, leaderboard, riwayat penghargaan baru, atau pengumuman
otomatis. Lookup member hanya untuk pilihan tag eksplisit; tidak mengambil gambar dari URL pengguna.

Gambar dan teks berasal dari template yang sama. Teks lengkap tetap tersedia dan Markdown
ditampilkan literal, roster berupa poin per orang. Preview selalu tanpa notifikasi. Revisi AI dimatikan untuk melindungi fakta.
Edit membuka form lima isian yang terisi dari draft. Submit lama, beda peminta/server,
izin editor yang dicabut, dan draft yang sudah diproses ditolak. Poster baru harus direview
lagi sebelum Publish. Draft legacy yang sudah menjadi teks bebas tetap memakai editor teks.
Tombol **Tag anggota (opsional)** membuka pilihan akun Discord, maksimal delapan anggota non-bot
di server yang sama. **Tanpa tag** menghapus pilihan; nama dan nickname di poster tidak berubah.
Tidak perlu mengetik mention di form pemain. Edit fakta menghapus pilihan tag, jadi pilih ulang.
Owner tetap satu-satunya yang boleh Publish/Jadwalkan. Akun diperiksa lagi saat publikasi;
preview tidak menandai siapa pun. Bila pengiriman bertag tidak pasti, klaim ditahan untuk review
operator tanpa pengiriman ulang otomatis, termasuk setelah restart.

Hall of Fame khusus galeri. Ajukan kartu lewat `bot-commands`; owner/editor mereview di
`bot-settings`. Routing Ops ke announcements belum berubah; publikasi Hall/sertifikat saat ini
tetap disupervisi pengelola, bukan klaim fitur intake sertifikat atau tujuan otomatis baru.
Bila render gagal, teks tetap bisa direview/dikirim. Gambar hanya di RAM dan Discord,
bukan file state baru. Logo, panggung, trofi, font dan ikon tetap lokal/bundled.

Poster Crown Stage 1080px lebar, minimal 1350px tinggi, bertambah sesuai panjang teks/roster
dengan batas 3600px. Hasil juara hanya ditonjolkan dari pernyataan eksplisit pengguna; apresiasi
umum tidak diberi peringkat rekaan. Nama dan nickname tidak dipotong. Exact Hengs Family/Familia
memakai turunan crest transparan; penerima lain memakai trofi. Sertifikat belum diterima atau
dibuat otomatis. Asal aset dan lisensi tersedia di `assets/appreciation/crown-stage/README.md`.

Kompatibilitas: binary lama membaca draft ini sebagai announcement biasa. Retensi Ops tidak
berubah: 250 draft finalized, 20 revisi per draft dan 500 audit; active drafts tetap tersimpan.
Idempotensi memakai external ID, claim-before-send dan footer recovery ID existing.
Tidak menambah queue, cache data pengguna, scheduler, worker atau dependency baru. Hanya
hasil decode aset tetap yang digunakan ulang per proses; input dan poster tidak dicache.

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
