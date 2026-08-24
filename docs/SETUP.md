# 🛠️ Setup Hengs Discord Bot

Panduan dapetin semua value buat file `.env`.

## 1. Bikin aplikasi & bot

1. Buka https://discord.com/developers/applications
2. **New Application** → kasih nama (mis. "Hengs")
3. Tab **Bot**:
   - **Reset Token** → copy → isi `DISCORD_TOKEN`
   - Aktifkan 3 intent: **MESSAGE CONTENT**, **SERVER MEMBERS**, **PRESENCE**
4. Tab **General Information** → **Application ID** → isi `DISCORD_CLIENT_ID`

## 2. Invite bot ke server

OAuth2 → **URL Generator** → scopes: `bot` + `applications.commands` → pilih permissions (paling gampang: `Administrator`) → copy URL → buka di browser → pilih server.

## 3. Ambil ID server & channel

Aktifkan **Developer Mode**: Settings → Advanced → Developer Mode (ON).

- Klik-kanan **server** → Copy Server ID → `DISCORD_GUILD_ID`
- Klik-kanan tiap **channel** → Copy Channel ID → isi `*_CHANNEL_ID`
- Atau: jalanin bot, lalu ketik `/admin ids` buat scan otomatis semua channel.

Untuk Ops Hub, isi nilai berikut:

- `OWNER_ID` — User ID Henry; wajib dan tetap menjadi pemegang keputusan final.
- `OPS_EDITOR_ROLE_IDS` — opsional, Role ID moderator/editor dipisah koma. Role ini dapat membuat, melihat, mengedit, dan merevisi draft.
- `BOT_SETTINGS_CHANNEL_ID` — channel privat `🎛️・bot-settings` untuk review draft.
- `ANNOUNCE_CHANNEL_ID` — channel publik tujuan pengumuman.

Ops Hub sengaja tidak memakai `BOT_CHANNEL_ID` sebagai fallback ruang review.
Biarkan `OPS_EDITOR_ROLE_IDS` kosong bila belum ada moderator. Role editor juga perlu permission Discord **Manage Messages** agar `/ops` terlihat; runtime Hengs tetap memeriksa Role ID pada setiap command, tombol, dan modal.

Setelah `/ops draft`, panel privat menyediakan:

- **Edit** — ubah judul dan isi melalui modal.
- **Perpendek** — AI meringkas tanpa membuang tanggal, tautan, syarat, atau call-to-action.
- **Regenerate** — AI membuat versi alternatif dari brief dan draft saat ini.
- **Publish Now** — kirim segera ke channel announcements.
- **Jadwalkan** — pilih waktu `HH:mm` atau `YYYY-MM-DD HH:mm` dalam WIB.
- **Batalkan Jadwal** — kembalikan draft terjadwal ke status pending.
- **Discard** — buang draft tanpa publikasi.

Editor hanya mendapat **Edit**, **Perpendek**, dan **Regenerate**. **Publish Now**, **Jadwalkan**, **Batalkan Jadwal**, dan **Discard** selalu membutuhkan `OWNER_ID`, meskipun editor dapat melihat tombolnya.

Revisi AI mengunci draft sementara agar tidak dapat dipublish bersamaan. Bila proses gagal atau bot restart, draft asli dipulihkan otomatis.

Jadwal minimal satu menit dari sekarang dan maksimal satu tahun. Input `HH:mm` memakai hari ini bila waktunya belum lewat, atau besok bila sudah lewat. Jadwal disimpan di `data/ops-state.json`, sehingga tetap aktif setelah restart. Hengs memeriksa jadwal setiap 15 detik. Pengiriman gagal dicoba ulang setelah 1 menit dan 5 menit; setelah kegagalan ketiga, draft kembali ke pending agar owner dapat mereview atau menjadwalkan ulang.

Gunakan `/ops history [limit]` untuk melihat 5–20 tindakan terbaru secara ephemeral. Audit menyimpan ID draft, jenis tindakan, pelaku, waktu, dan metadata operasional terbatas; judul serta isi draft tidak disalin ke audit.

## 4. API key AI (buat chat via mention)

- **Groq** (cepat, free): https://console.groq.com → `GROQ_API_KEY`
- **OpenRouter** (fallback): https://openrouter.ai → `OPENROUTER_API_KEY`

## 5. Restricted document translation

Isi konfigurasi berikut:

- `DEEPL_API_KEY` — key server-side DeepL; jangan pernah ditaruh di source/client.
- `TRANSLATE_ALLOWED_USER_IDS` — ID Discord VIP dipisah koma. `OWNER_ID` selalu otomatis diizinkan.
- `TRANSLATE_TIMEOUT_MS` — opsional, default 180000 (3 menit).
- `TRANSLATE_MAX_QUEUE` — opsional, default 3 job aktif + antre.

Command:

```text
/translate file:<attachment> to:<bahasa> non_sensitive:true
```

Format awal: PDF, DOCX, PPTX, HTML, TXT. Bahasa sumber dideteksi otomatis. Pada API Free hanya gunakan dokumen non-sensitif; file lokal sementara dihapus setelah response attachment selesai dikirim.

## 6. Jalankan

```bash
npm install
npm run deploy   # daftarin slash commands ke server (sekali / tiap nambah command)
npm start
```

Jalankan test lokal sebelum registrasi command:

```bash
npm test
npm run verify:server
```

`verify:server` adalah pemeriksaan read-only. Bot tidak mengirim pesan atau mengubah
server; alat ini memvalidasi ID channel, permission, hierarchy role Member/reaction
roles, owner, dan pesan reaction-role yang tersimpan.

> Auto-setup struktur server: jalanin `/admin setup` di server (bikin channel & kategori otomatis).

Setelah menambahkan atau memperbarui Event Hub, jalankan `npm run deploy` dengan izin
owner agar Discord mendaftarkan `/event draft` dan `/event status`. Event memakai
`BOT_SETTINGS_CHANNEL_ID`, `ANNOUNCE_CHANNEL_ID`, `OWNER_ID`, dan optional
`OPS_EDITOR_ROLE_IDS` yang sama dengan Ops Hub; tidak memerlukan permission Discord
Scheduled Events karena publikasinya berupa pesan RSVP biasa.

Bridge Canox Event Hub memakai `data/canox-event-inbox.json` secara default. Override
`EVENT_DATA_DIR` hanya untuk test atau layout lokal lanjutan; Canox dapat mengarahkan
sender dengan `DISCORD_EVENT_INBOX_FILE`. Penambahan bridge tidak mengubah schema slash
command, jadi `npm run deploy` tidak perlu dijalankan ulang untuk v1.7.0.

Event Draft Editor v1.8.0 memakai tombol dan modal pada panel yang sudah ada, sehingga
schema `/event` tetap sama dan tidak memerlukan `npm run deploy`. Role pada
`OPS_EDITOR_ROLE_IDS` dapat mengedit isi draft, tetapi Publish, Discard, dan Cancel
tetap diverifikasi sebagai tindakan owner-only saat interaksi dijalankan.

## 7. Public Self-Service Beta untuk server lain

Public Beta v1.28.0 hanya membuka `/setup`, `/hengs`, chat lewat mention, dan Community Pack yang
harus diaktifkan owner. Command admin, moderasi, laporan, Ops Hub, Event Hub, reaction role, dan
voice tetap khusus server utama.

### Langkah pengelola Hengs

1. Pastikan aplikasi Hengs mengizinkan pemasangan publik oleh server lain di Discord Developer
   Portal. Token bot tetap privat dan tidak pernah ikut dalam URL.
2. Atur `HENGS_PUBLIC_GUILD_LIMIT=25`. Nilai valid adalah 1 sampai 100.
   Atur `HENGS_PUBLIC_DAILY_REQUEST_LIMIT=100` untuk batas permintaan AI per server publik per
   hari UTC. Nilai valid adalah 10 sampai 300.
3. Setelah deployment dan registrasi command mendapat izin owner, jalankan
   `npm run invite:public` untuk membuat URL undangan publik. Generator hanya meminta View
   Channel, Send Messages, Read Message History, dan Attach Files. Generator tidak membaca atau
   mencetak token.
4. Bagikan URL itu. Member juga dapat meminta link yang sama lewat
   `/hengs invite`. Server ID tidak perlu diminta atau dimasukkan secara manual.

### Langkah teman yang memasang Hengs

1. Buka URL undangan Hengs.
2. Pilih server Discord yang ingin dipasangi bot. Akun pemasang perlu hak untuk mengelola server.
3. Tekan Authorize dan selesaikan pemeriksaan Discord jika muncul.
4. Hengs mengirim satu panduan ke channel yang dapat ditulis. Jika tidak ada channel yang cocok,
   `/setup` tetap dapat digunakan tanpa pesan sambutan.
5. Di server tersebut, pemilik server atau Administrator menjalankan `/setup start`.
6. Pilih satu text channel atau announcement channel dari menu Discord. Hengs Standard langsung
   memakai gaya Santai, bahasa Otomatis, menjawab hanya di channel itu, dan mengaktifkan Community
   Pack di channel yang sama. Tidak ada ID yang perlu dicari atau diketik.
7. Jalankan `/setup dashboard` untuk membuka Control Center privat. Dari sana pengelola dapat
   melihat status, kesehatan konfigurasi, tren penggunaan, memilih ulang channel, preview kartu,
   membuka Insights, atau memulai konfirmasi nonaktifkan.
   Tombol Pengaturan membuka preset gaya dan bahasa, pemilih channel chat, pemilih channel
   Community Pack, mode Semua Channel, serta tombol Matikan Community Pack.
8. Bila perlu, ubah gaya melalui `/setup style`, bahasa melalui `/setup language`, cakupan melalui
   `/setup channel`, atau Community Pack melalui `/setup welcome`.
9. Jalankan `/setup welcome action:preview` atau tombol Preview Welcome untuk melihat kartu secara privat.
10. Baca `/hengs privacy` untuk memahami pemrosesan AI, memori percakapan, dan data konfigurasi.
11. Setelah respons aktif muncul, member dapat menulis `@Hengs pertanyaan` atau memakai
   `/hengs ask`. `/hengs reset` hanya menghapus ingatan percakapan milik pemanggil.
12. Gunakan `/setup insights` atau tombol Buka Insights untuk melihat penggunaan, feedback, tren tujuh hari, dan kesehatan
   konfigurasi. Laporan ini privat dan tidak menyimpan isi chat, jawaban, atau identitas member.
13. Gunakan `/setup status` untuk pemeriksaan singkat. `/setup disable` dan tombol Nonaktifkan Hengs
   selalu meminta konfirmasi kedua sebelum menghapus konfigurasi serta Owner Insights server.

Setiap server memiliki konteks AI sendiri. Public Beta dibatasi 25 server aktif secara default,
satu jawaban AI berjalan per server, dan 30 permintaan per 10 menit per server. Prompt publik tidak
membawa profil pribadi Henry.

Pesan sambutan tidak membuat channel, tidak menyebut pengguna, tidak retry, dan tidak mengaktifkan
server secara otomatis. Wizard hanya menerima satu channel dari pemilih bawaan Discord dan
memeriksa izin sebelum satu write atomik. Preset Hengs Standard adalah mapping publik tetap dan
tidak menyalin pengaturan, channel, role, atau data server utama Henry.

Checkpoint v1.28.0 tidak mengubah schema slash command. Deployment gabungan v1.26.0 sampai
v1.28.0 tetap memerlukan satu registrasi global command untuk `/setup dashboard` setelah health
service lulus.

Jangan menjalankan `npm run deploy` dari laptop yang belum direview. Perintah itu melakukan
registrasi eksternal: `/setup` dan `/hengs` menjadi global, sedangkan seluruh command lama tetap didaftarkan
hanya ke `DISCORD_GUILD_ID`.

## 🔐 Catatan keamanan

- Token bocor (ke-share di chat/screenshot/commit)? **Langsung Reset Token** di Developer Portal, update `.env`.
- File `.env` & folder `data/` otomatis di-ignore Git — aman dari ke-push nggak sengaja.
