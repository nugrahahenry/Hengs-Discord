# Hengs Incident Report Hub

`/report` menyediakan jalur privat bagi seluruh member server untuk mengirim laporan
insiden kepada owner dan reviewer yang dipercaya. Fitur ini membantu manusia melakukan
triase; Hengs tidak menentukan kebenaran laporan dan tidak memberi hukuman otomatis.

## Batas Dengan Anti-Raid

Report Hub tetap jalur review manusia untuk harassment, konteks ambigu, dan laporan
komunitas. Anti-Raid adalah surface `/mod` terpisah untuk trigger deterministik; ia tidak
membuat, mengubah, atau menghukum berdasarkan laporan `/report`. Antrean Anti-Raid hanya
menampilkan 10 insiden terbaru yang metadata-only, sedangkan `/reports` tetap antrean
reviewer aktif yang paling lama terlebih dahulu seperti dijelaskan di bawah.


## Konfigurasi

```dotenv
MOD_LOG_CHANNEL_ID=
REPORT_MODERATOR_ROLE_IDS=
REPORT_EVIDENCE_MAX_BYTES=8388608
REPORT_RETENTION_DAYS=30
```

- `MOD_LOG_CHANNEL_ID` wajib menunjuk text channel privat. Runtime menolak intake bila
  `@everyone` masih memiliki View Channel atau bot tidak memiliki View Channel, Send
  Messages, Embed Links, Attach Files, dan Read Message History.
- `REPORT_MODERATOR_ROLE_IDS` adalah daftar role ID dipisah koma. Nilai kosong berarti
  owner-only. Jangan memakai role umum seperti Member.
- Administrator Discord tetap dapat melihat channel walau overwrite menolak View
  Channel. Karena itu Administrator termasuk batas kepercayaan operasional.
- Batas bukti selalu nilai terkecil antara konfigurasi, 8 MiB, dan limit Discord.
- Retention dibatasi 1-365 hari dan default 30 hari.

## Alur Member

Gunakan `/report` dengan `category` dan `details`. Opsi tambahan: `member`,
`message_link`, `evidence`, dan `anonymous`. Link pesan hanya diterima dari server yang
sama dan Hengs tidak menyalin isi pesannya. Respons intake selalu ephemeral.

`anonymous:false` menampilkan pelapor kepada reviewer. `anonymous:true` menampilkan
"Pelapor anonim" pada panel bersama. Owner tetap dapat memakai **Reveal Reporter**;
hasil reveal hanya dikirim secara ephemeral dan audit hanya mencatat bahwa reveal
terjadi, bukan menyalin identitasnya.

## Alur Reviewer

- **Claim**: mengambil tanggung jawab atas laporan terbuka.
- **Release Claim**: mengembalikan laporan ke antrean; hanya claimant atau owner.
- **Resolve**: menutup laporan sebagai selesai dengan catatan internal 5-500 karakter.
- **Dismiss**: menutup tanpa tindakan dengan catatan internal 5-500 karakter.
- **Reopen**: owner-only, membuka kembali laporan final.
- **Reveal Reporter**: owner-only dan ephemeral.
- **Purge**: owner-only, membutuhkan pengetikan ID laporan secara persis.
- **Normal / Penting / Mendesak**: mengubah priority triase tanpa memutuskan benar-salah
  laporan. Category harassment, spam/scam, dan inappropriate default ke Penting;
  category lain default ke Normal.

Semua aksi memeriksa role dan revisi state saat tombol/modal dikirim. Tampilan tombol
tidak dianggap sebagai izin. Dua Claim pada revisi yang sama hanya menghasilkan satu
pemenang.

## Antrean Reviewer

`/reports` menampilkan laporan open dan claimed untuk owner/reviewer. Command tidak
memakai permission tampilan Discord sebagai satu-satunya guard: `OWNER_ID` atau role
`REPORT_MODERATOR_ROLE_IDS` diverifikasi ulang saat membuka antrean dan pada setiap
tombol pagination/refresh.

Setiap halaman memuat maksimum 10 laporan, paling lama terlebih dahulu. Priority hanya
memecah urutan jika timestamp sama. Page maksimum dibatasi dan request ke halaman yang
sudah kosong di-clamp ke halaman aktif terakhir.

Antrean sengaja metadata-only. Field yang boleh tampil hanya Report ID, status,
priority, category, usia relatif, claimant, dan link panel privat yang dibentuk hanya
bila guild/channel/message ID valid. Detail, reporter, target, message link, evidence,
final note, dan audit tidak masuk payload. Respons selalu ephemeral dan menonaktifkan
mention parsing.

Priority change memakai revision compare-and-set. Dua reviewer yang menekan revision
yang sama hanya menghasilkan satu perubahan; tombol stale mendapat respons privat.
Jika Discord gagal mengedit panel setelah state berubah, `messageSyncPending` tetap
aktif agar startup recovery menyinkronkan panel kemudian.

## Bukti dan Privasi

Format yang diterima: PNG, JPEG, WEBP, GIF, MP4, WEBM, PDF, dan TXT. Hengs memeriksa
HTTPS Discord CDN, extension, MIME, ukuran, dan signature isi. Unduhan dibatasi saat
stream berjalan, memiliki timeout 30 detik, lalu diunggah ulang ke panel privat. Folder
lokal `hengs-report-*` dibersihkan setelah sukses/gagal dan saat startup bila stale.

State lokal berada di `data/reports-state.json` dan tidak masuk Git. Audit hanya berisi
Report ID, tindakan, actor, waktu, dan kode operasional terbatas. Isi laporan, link,
bukti, serta catatan final tidak disalin ke audit atau log normal.

Hengs tidak mengirim laporan lewat DM, tidak menghubungi target, tidak membuat pesan
publik, dan tidak menjalankan timeout/mute/kick/ban/warning. Moderator wajib menilai
konteks dan bukti secara manusiawi.

## Batas Anti-Raid

`/report` tetap jalur review manusia untuk harassment, percakapan ambigu, dan kategori
insiden komunitas. Laporan tidak menghapus pesan atau memberi timeout, kick, maupun ban
otomatis. Anti-Raid adalah boundary terpisah untuk pola promo/scam/domain atau banjir
attachment berkeyakinan tinggi yang ditentukan aturan, bukan AI. Konfigurasi, ambang,
pengecualian, dan recovery operator tersedia di [`ANTI-RAID.md`](ANTI-RAID.md).

## Recovery

State ditulis melalui temporary file, flush, dan atomic rename. State legacy tanpa
priority dimigrasikan atomik; field parsial atau invalid gagal tertutup. Panel yang berubah
tetapi gagal diedit ditandai untuk sinkronisasi startup. Laporan resolved/dismissed yang
melewati retention masuk `purge_pending`; state baru dihapus setelah panel Discord
berhasil dihapus atau Discord menyatakan pesannya sudah tidak ada. Gangguan izin atau
jaringan mempertahankan `purge_pending` agar worker 10 menit dapat mencoba ulang.
