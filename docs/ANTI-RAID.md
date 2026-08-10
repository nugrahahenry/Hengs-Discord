# Hengs Deterministic Anti-Raid

Anti-Raid mengurangi dampak raid promo, scam, domain dewasa yang dikonfigurasi, dan
banjir attachment berulang. Fitur ini memakai aturan yang dapat diaudit, bukan AI:
Hengs tidak mengirim teks pesan, URL, attachment, atau media ke model AI, layanan
reputasi URL, Canox, maupun Hengs WhatsApp.

Anti-Raid bukan jalur untuk harassment atau percakapan yang ambigu. Gunakan `/report`
agar moderator meninjau laporan secara manusiawi; lihat
[`REPORT-HUB.md`](REPORT-HUB.md).

## Konfigurasi Dan Izin

```dotenv
OWNER_ID=
MOD_LOG_CHANNEL_ID=
MODERATION_ROLE_IDS=
ANTI_RAID_MODE=active
ANTI_RAID_BLOCKED_DOMAINS=
MODERATION_DATA_DIR=
```

- `OWNER_ID` wajib ID user Discord yang valid.
- `MOD_LOG_CHANNEL_ID` wajib sebuah text channel privat. Tidak ada fallback nama atau
  channel publik. `@everyone` harus **tidak** memiliki View Channel.
- Bot membutuhkan View Channel, Send Messages, Embed Links, dan Read Message History
  pada mod-log; serta Ban Members dan Manage Messages untuk enforcement aktif.
- Posisi role bot harus lebih tinggi daripada target yang dapat diban.
- `MODERATION_ROLE_IDS` adalah daftar role ID moderator dipisah koma. Kosong berarti
  `/mod` dan pengecualian moderator tetap owner-only; role ini berbeda dari
  `REPORT_MODERATOR_ROLE_IDS` dan `OPS_EDITOR_ROLE_IDS`.
- `ANTI_RAID_BLOCKED_DOMAINS` adalah daftar bare host dipisah koma, contoh
  `bad.example, scam.example`. Jangan gunakan scheme, path, port, wildcard, atau
  credential. Domain hanya cocok pada host tepat atau subdomain berbatas label;
  pencocokan substring tidak digunakan.
- `MODERATION_DATA_DIR` opsional untuk lokasi state lokal. Default berada di `data/`.
  `data/moderation-state.json` tidak masuk Git.

Sebelum memakai mode `active`, cek permission channel dan hierarchy bot di Discord
Server Settings, lalu jalankan `/mod status`. Administrator Discord tetap termasuk
batas kepercayaan karena dapat melewati overwrite channel.

## Mode Dan Fail-Safe

- `active`: mendeteksi, mencatat, menghapus payload raid terbaru, dan memban akun saat
  trigger berkeyakinan tinggi terpenuhi.
- `monitor`: mendeteksi dan mencatat tanpa menghapus atau memban.
- `off`: tidak mengamati maupun menegakkan policy.

`ANTI_RAID_MODE` hanya menentukan mode awal. Setelah state disimpan, pilihan owner
menjadi sumber mode runtime. Default adalah `active`, tetapi Hengs memaksa
monitor-only bila owner/configuration/state tidak valid, mod-log hilang atau terlihat
oleh `@everyone`, permission mod-log atau ban tidak tersedia, Manage Messages hilang,
atau target tidak dapat diban karena hierarchy. Mode aman ini dicatat dengan fixed
issue code, bukan error mentah.

## Aturan Deterministik

Satu pesan non-exempt menjadi actionable bila memenuhi salah satu aturan berikut:

1. **Blocked domain**: host ada di `ANTI_RAID_BLOCKED_DOMAINS`, kecuali allowed domain
   mengalahkannya.
2. **Cross-channel repeat**: signature konten, URL, atau attachment yang sama muncul
   di minimal 3 channel berbeda dalam 60 detik.
3. **Single-channel burst**: minimal 5 pesan dari member yang sama dalam satu channel
   selama 30 detik, membawa link atau attachment, dan berbagi signature konten, domain,
   atau keluarga attachment.
4. **Cross-channel attachment flood**: minimal 3 pesan ber-attachment dari member yang
   sama di 3 channel berbeda dalam 60 detik.

Pesan teks biasa hanya dapat match aturan cross-channel repeat yang ketat. Satu promosi,
satu attachment, atau beberapa pesan normal yang berbeda tidak menghasilkan ban.
Hengs tidak mengunduh atau mengikuti tautan dan tidak memakai blocklist eksternal.
Daftar blocked domain kosong hanya menonaktifkan ban langsung karena domain; deteksi
perilaku tetap aktif.

## Pengecualian

Anti-Raid mengabaikan bot Discord, webhook, system message, DM, `OWNER_ID`, owner
guild, member dengan Administrator, member dengan role di `MODERATION_ROLE_IDS`, dan
role atau channel dalam allowlist. Domain allowed menang atas blocked domain hanya untuk
URL HTTP(S) normal tanpa credential dan port non-default. URL hostile tetap dihitung
sebagai sinyal perilaku, dan host yang diblokir tetap actionable. Domain milik Discord
yang diperlukan operasi server juga allowed untuk URL normal. Pengecualian domain tidak
menghapus sinyal attachment flood yang tidak terkait.

Pengecualian dibaca ulang pada setiap pesan dan sebelum enforcement atau interaksi
`/mod`; membership lama atau tombol cache bukan izin.

## Operasi `/mod`

`/mod` hanya tersedia di dalam guild. Semua respons ephemeral dan menonaktifkan mention
parsing.

- `/mod status`: owner dan role `MODERATION_ROLE_IDS` melihat Mode tersimpan, Mode efektif,
  label prasyarat yang telah disanitasi, snapshot tracker saat ini (guild, member,
  observasi), serta jumlah final Diblokir, Dipantau, Tindakan sebagian, dan Perlu tindak
  lanjut. Hanya owner yang dapat mengubah mode Active, Monitor, atau Off melalui tombol
  revision-safe.
- `/mod incidents [page]`: owner dan moderator melihat hingga 10 insiden per halaman,
  diurutkan dari yang terbaru. Setiap item hanya memuat ID insiden, usia terikat, member
  ID non-mention, trigger dan status terikat, jumlah pesan/kanal maksimum 9.999, serta
  link panel privat bila semua ID panel valid. Tombol Sebelumnya, Segarkan, dan
  Berikutnya memeriksa ulang izin serta menjepit halaman lama ke rentang 1-50 yang masih
  tersedia. Pesan, URL, domain, attachment, dan error mentah tidak ditampilkan.
- `/mod allow role add|remove|list`, `/mod allow channel add|remove|list`, dan
  `/mod allow domain add|remove|list`: hanya owner. Aksi `list` mengembalikan maksimal
  10 nilai tersimpan yang lolos validasi tampilan, beserta jumlah aman; nilai mentah
  atau tidak valid tidak dikirim ke Discord. Role/channel memakai pilihan Discord
  bertipe; domain divalidasi dan dinormalisasi sebelum state ditulis.

## Privasi, State, Dan Recovery

Tracker in-memory memakai signature HMAC-SHA256 dengan kunci acak per proses. Kunci dan
observasi rolling tidak dipersist, sehingga restart sengaja mereset korelasi. Tracker
menyimpan paling banyak 100 observasi per member, 2.000 per guild, dan 120 detik riwayat.
Referensi objek pesan untuk fallback deletion juga dibatasi 2.000, memiliki TTL 120 detik
yang berjalan tanpa menunggu traffic baru, dan segera dilepas setelah insiden selesai.

State persisten memakai `schemaVersion: 1`, temporary file, fsync, dan atomic rename.
State legacy `schema: 1` divalidasi lalu dimigrasikan atomik. State menyimpan paling
banyak 500 insiden dan 500 audit record. Insiden hanya boleh dievakuasi setelah final dan
panel privatnya sudah tersimpan; evidence recovery tidak ditimpa saat kapasitas penuh.
Insiden/audit hanya menyimpan ID operasional, timestamp, trigger, jumlah, status, booleans
aksi, revision, dan fixed issue code; tidak menyimpan konten pesan, URL/domain,
filename/URL attachment, observation rolling, atau raw exception. State korup atau penuh
tanpa kandidat eviksi aman menghentikan enforcement secara fail-closed, dan pesan yang
sudah match tetap dihentikan sebelum jalur AI.

Ketika trigger actionable terjadi, Hengs mengklaim satu insiden per member/window.
Window menit bersebelahan untuk member yang sama dideduplikasi agar tidak menghasilkan ban
atau kartu ganda. Hengs kemudian
menyimpan `enforcing`, mencoba ban dengan penghapusan 120 detik, lalu mencatat
`banned`, `partial`, atau `failed`. Ban gagal hanya menghapus pesan ter-track yang unik
dan terbatas. Startup mengklaim kembali insiden `detected`, memeriksa status ban untuk
insiden `enforcing`, dan menghindari ban ganda. Panel privat yang belum tersimpan dicari
berdasarkan marker lalu dicoba ulang oleh maintenance sampai tersimpan, tanpa menggandakan
panel. Tidak ada DM offender atau pengumuman publik.

Kartu mod-log hanya memuat ID/waktu/trigger/status, offender mention/ID dengan mention
parsing mati, jumlah pesan/channel, hasil ban/penghapusan, dan fixed issue code. Ia
tidak memuat konten, domain/link, attachment, preview media, maupun error mentah.

v1.13.0 tidak menyediakan tombol Unban. Reversal dilakukan secara manual oleh operator
yang berwenang melalui Discord Server Settings sampai checkpoint appeal/rollback terpisah
dirancang.

## Acceptance Live

Acceptance live masih pending dan membutuhkan persetujuan eksplisit Henry untuk
mendaftarkan slash command `/mod` dan me-restart tepat satu instance bot. Setelah itu,
verifikasi `/mod status`, queue insiden privat, dan pesan owner yang exempt. Uji auto-ban
mode `active` hanya boleh memakai akun dummy disposable yang disediakan dan disetujui
Henry. Jangan memban member nyata untuk acceptance; gunakan mode `monitor` dan fixture
sintetis bila akun dummy belum tersedia. Hapus state/kartu uji dan pastikan tidak ada
insiden uji aktif setelah selesai.
