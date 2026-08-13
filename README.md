# 🤖 Hengs Discord Bot — Henzzz

> Bot komunitas serba-bisa untuk server Discord: AI chat, mode fokus, welcome card custom, reaction roles, dan auto-setup struktur server.

**Current checkpoint:** v1.18.0

## ✨ Fitur Utama

- **AI chat via mention** — tinggal mention bot, dia bales kontekstual (history per user)
- **Mode fokus** — `/study on/off/status`, `/scrim on/off`
- **Utility** — `/announce`, `/fun` (quote · 8ball · roll · flip · meme)
- **Ops Hub** — `/ops draft` menyusun pengumuman dengan AI; editor allowlist dapat membuat dan merevisi draft, sedangkan owner memegang Publish Now, jadwal, pembatalan, dan Discard
- **Community Event Hub** — `/event draft` membuat event ber-approval dengan RSVP, kapasitas, reminder, cancel, dan auto-close
- **Restricted document translation** — `/translate` menerjemahkan PDF, DOCX, PPTX, HTML, atau TXT non-sensitif melalui DeepL, khusus owner/VIP
- **Private WhatsApp recovery alerts** - owner DM first, exact private `BOT_SETTINGS_CHANNEL_ID` fallback, with deduplication and bounded retry
- **Always Free deployment support** - bounded OCI acquisition, privacy-safe fixed diagnostics, immutable Linux releases, persistent state, systemd hardening, health inspection, and rollback; operator guide: [`docs/CLOUD-DEPLOY.md`](docs/CLOUD-DEPLOY.md)
- **Runtime health contract** — heartbeat lokal atomik untuk status connected, reconnecting, stale, failed, dan recovery tanpa data privat
- **Community Operations Dashboard** — `/ops overview` merangkum health, draft, event, antrean terjemahan, dan mode fokus secara privat
- **Incident Report Hub** — semua member dapat memakai `/report`; laporan opsional anonim masuk ke panel moderator privat dengan Claim, Resolve, Dismiss, Reopen, dan Purge
- **Moderation Queue** - `/reports` memberi owner/moderator antrean privat metadata-only dan panduan tindakan yang jelas; owner dapat membuka contoh sintetis saat antrean kosong
- **Deterministic Anti-Raid** - `/mod` memantau atau menangani pola raid berkeyakinan tinggi tanpa klasifikasi AI; detail operator ada di [`docs/ANTI-RAID.md`](docs/ANTI-RAID.md)
- **Auto-setup server** — `/admin setup` bikin struktur channel otomatis (fuzzy emoji matching, skip yang udah ada)
- **Reaction roles** — `/admin rolereact` (persist ke `data/`)
- **Welcome / leave card custom** — gradient bg, avatar glow, member count, umur akun — di-render via `@napi-rs/canvas`
- **Auto-assign role** Member pas join + **stats channel** auto-update (jumlah member dll)
- **Admin tools** — `/admin ids`, `/admin webhook`, `/admin lockdown`

## 🛠️ Stack

| Komponen | Teknologi |
|---|---|
| Runtime | Node.js |
| Library | discord.js v14 |
| Grafis | @napi-rs/canvas (welcome card) |
| Voice | @discordjs/voice + tweetnacl |
| AI | Groq / OpenRouter (via openai SDK) |
| Dokumen | DeepL Document Translation API |

## 🚀 Setup

```bash
# 1. Install dependencies
npm install

# 2. Siapkan konfigurasi
cp .env.example .env
#    -> isi DISCORD_TOKEN, CLIENT_ID, GUILD_ID, channel IDs, API key

# 3. Daftarkan slash commands (sekali, atau tiap nambah command baru)
npm run deploy

# 4. Jalankan
npm start
```

Panduan lengkap dapetin token & channel ID ada di **`docs/SETUP.md`**.

### Auto-start tersembunyi (Windows, opsional)

```bash
install-autostart.bat   # pasang sekali -> bot nyala sendiri tiap login
start-hidden.vbs        # nyalain manual sekarang (tanpa window)
stop-bot.bat            # hentikan bot
```

### Cloud deployment (belum live)

Dukungan deployment Always Free untuk Ubuntu tersedia bagi A1 Flex dan E2 Micro. A1 memakai
sizing fleksibel, sedangkan E2 adalah fixed shape dan memiliki config/state terpisah agar histori
acquisition tidak bercampur. OCI CLI tidak melakukan retry internal `LaunchInstance`; error
provider dipetakan ke kode tetap tanpa menyimpan output mentah. Schema slash command tidak
berubah, jadi registrasi ulang command tidak diperlukan. Satu E2 Micro Always Free berhasil
dibuat pada 14 Agustus 2026 dan berstatus `RUNNING`. Bootstrap Ubuntu sudah lulus dengan Node 22,
UFW, Tailscale, user layanan, dan unit systemd. Release immutable v1.18.0 sudah terpasang dan
lulus dependency/test acceptance di Ubuntu, tetapi service Hengs tetap disabled/inactive dengan
env kosong dan state produksi kosong. Laptop dan VM sudah terdaftar pada tailnet yang sama, dan acceptance
SSH privat melalui Tailscale sudah lulus. VM belum menjadi production. Transfer secret/state dan
cutover final tetap memerlukan approval terpisah. Ikuti [panduan cloud](docs/CLOUD-DEPLOY.md); bot lokal
harus dihentikan sebelum service cloud memakai token Discord.

## 💬 Commands

| Command | Fungsi |
|---|---|
| `@Hengs <pesan>` | Ngobrol sama AI |
| `/study on/off/status` · `/scrim on/off` | Mode fokus |
| `/announce` · `/fun ...` | Pengumuman & hiburan |
| `/ops draft` · `/ops status` · `/ops history` · `/ops overview` | Draft pengumuman, approval owner, audit, dan ringkasan operasi privat |
| `/event draft` · `/event status` | Event komunitas dengan approval owner, RSVP, kapasitas, reminder, dan auto-close |
| `/translate file to non_sensitive:true` | Terjemahkan dokumen non-sensitif; bahasa sumber dideteksi otomatis |
| `/report category details [member] [message_link] [evidence] [anonymous]` | Kirim laporan insiden privat kepada owner/moderator |
| `/reports` | Buka antrean laporan aktif privat untuk owner/moderator |
| `/mod status` · `/mod incidents` · `/mod preview` · `/mod allow ...` | Lihat status/insiden, buka pratinjau owner-only, atau kelola pengecualian Anti-Raid |
| `/admin setup` | Auto-bikin struktur server |
| `/admin rolereact` | Pasang reaction roles |
| `/admin ids` | Scan channel ID buat .env |

## 📁 Struktur

```
discord-bot/
├── src/
│   ├── index.js            # entry point, event handler
│   ├── agent.js            # logika AI chat
│   ├── state.js            # state mode
│   ├── deploy-commands.js  # daftarin slash commands ke Discord
│   ├── commands/           # slash commands, termasuk ops & translate
│   ├── ops/                # draft store, owner approval, inbox Canox
│   ├── events/             # event approval, RSVP, reminder, recovery
│   ├── translation/        # DeepL client, validasi, antrean, cleanup
│   ├── runtime/            # health lokal dan konsumer recovery alert WhatsApp
│   ├── reports/            # intake privat, state machine, bukti, panel, recovery
│   ├── moderation/         # policy deterministic Anti-Raid, tracker, enforcement, state privat
│   └── utils/
│       ├── welcome-card.js # render welcome/leave card (canvas)
│       └── role-store.js   # persistensi reaction roles
├── docs/                   # SETUP.md, dll
├── test/                   # test race/idempotensi Ops Hub
├── .env.example            # template konfigurasi
└── package.json
```

## ⚠️ Catatan

### Ops Hub: Canox → Discord dengan approval owner

Canox tidak boleh mem-posting ke channel publik secara langsung. Untuk menyusun pengumuman, ia dapat menulis draft ke `data/canox-ops-inbox.json`:

```json
{
  "drafts": [
    {
      "id": "event-unik-001",
      "title": "Turnamen komunitas Sabtu ini",
      "body": "Daftar sebelum Jumat, 20.00 WIB.",
      "context": "Sumber dan detail pencarian Canox"
    }
  ]
}
```

Hengs hanya menaruhnya sebagai draft di `🎛️・bot-settings`. Owner dan role dalam `OPS_EDITOR_ROLE_IDS` dapat mengubah manual lewat **Edit** atau meminta AI **Perpendek** dan **Regenerate**. Hanya owner yang dapat memilih **Publish Now**, **Jadwalkan**, **Batalkan Jadwal**, atau **Discard**. Jadwal menerima `HH:mm` atau `YYYY-MM-DD HH:mm` dalam WIB dan tetap tersimpan setelah bot restart. Isi `OWNER_ID`, `BOT_SETTINGS_CHANNEL_ID`, dan `ANNOUNCE_CHANNEL_ID` di `.env`; biarkan `OPS_EDITOR_ROLE_IDS` kosong sampai role moderator siap. Jika ID ruang review belum diisi, fallback hanya menerima nama channel persis `🎛️・bot-settings` atau `bot-settings`—tidak pernah channel bot umum.

Setiap draft Canox wajib punya `id` unik. Canox harus menulis JSON ke file sementara terlebih dahulu, lalu melakukan rename atomik menjadi `canox-ops-inbox.json`; ini mencegah Hengs membaca file yang baru ditulis setengah. Ops Hub menyimpan status lokal di `data/ops-state.json`, menolak external ID yang sama, serta memakai lock terpisah untuk revisi dan publish. Selama AI merevisi, semua tombol dinonaktifkan; kegagalan atau restart mengembalikan draft asli ke status pending. Worker jadwal mengklaim satu draft sebelum mengirim, lalu mencoba ulang setelah 1 menit dan 5 menit bila pengiriman gagal. Setelah tiga kegagalan, draft kembali ke pending untuk direview owner. Maksimal 20 versi draft dan 500 tindakan audit disimpan lokal. `/ops history` hanya menampilkan tindakan, ID draft, pelaku, dan waktu—tidak menyalin isi draft.

Untuk verifikasi lokal tanpa mendaftarkan command ke Discord:

```bash
npm test
npm run verify:server
```

`verify:server` hanya membaca Discord API. Pemeriksaan ini tidak mengirim pesan,
mengubah role, atau mendaftarkan slash command; hasilnya mencakup channel operasional,
permission bot, role hierarchy, owner, dan keberadaan pesan reaction-role.

### Runtime health

Saat proses berjalan, Hengs menulis `data/runtime-health.json` setiap 30 detik dengan
atomic rename. Snapshot berisi versi, uptime, heartbeat, status koneksi Discord, dan
kode masalah terbatas. Token, ID Discord, nama server, pesan, draft, dokumen, path,
serta error mentah tidak disimpan.

Single-instance lock juga memiliki heartbeat 30 detik. Lock yang tidak diperbarui lebih
dari lima menit dapat dipulihkan, sehingga PID Windows yang sudah hilang tetapi salah
terbaca `EPERM` tidak membuat launcher terjebak restart selamanya.

Consumer lokal wajib memeriksa freshness: Hengs hanya boleh dianggap online ketika
status `CONNECTED` dan heartbeat belum melewati 90 detik. Schema lengkap dan aturan
stale ada di [`docs/RUNTIME-HEALTH.md`](docs/RUNTIME-HEALTH.md). Lokasi dapat diubah
melalui `HENGS_RUNTIME_HEALTH_FILE`, tetapi jangan diarahkan ke folder publik.

### Community Operations Dashboard

Gunakan `/ops overview` untuk melihat satu ringkasan privat tentang runtime Hengs,
pekerjaan Ops Hub, Event Hub, antrean penerjemah, dan mode fokus. Command ini hanya
dapat dipakai owner atau role dalam `OPS_EDITOR_ROLE_IDS`, memakai respons ephemeral,
dan tidak menjalankan tindakan otomatis.

Dashboard hanya membaca angka agregat dan status allowlist. Isi draft, judul event,
daftar RSVP, nama/ID anggota, nama file, topik fokus, dokumen, token, serta error mentah
tidak dimasukkan ke embed. Jika satu state store rusak atau tidak dapat dibaca, bagian
tersebut ditandai tidak tersedia sementara bagian lain tetap tampil. Kontrak lengkap
ada di [`docs/COMMUNITY-OPERATIONS.md`](docs/COMMUNITY-OPERATIONS.md).

Token Discord = **rahasia**. Kalau pernah ke-share di mana pun (chat, screenshot, commit), langsung **Reset Token** di Developer Portal. File `.env` & folder `data/` otomatis di-ignore Git.

### Community Event Hub

Gunakan `/event draft` untuk menyiapkan event di ruang privat `bot-settings`. Waktu
menerima `HH:mm` atau `YYYY-MM-DD HH:mm` dalam WIB. Owner harus menekan **Publish
Event** sebelum event muncul di announcements. Owner dan role `OPS_EDITOR_ROLE_IDS`
dapat merevisi draft langsung dari panel lewat **Edit Detail** serta **Kapasitas &
Sumber**, tetapi hanya owner yang dapat Publish, Discard, atau Cancel. Setiap modal
membawa nomor revisi sehingga form lama tidak dapat menimpa perubahan yang lebih baru.
Draft yang jadwalnya sudah lewat ditolak saat Publish dan harus diperbarui ke waktu
yang masih akan datang.

Setelah tayang, anggota dapat memilih **Hadir**, **Mungkin**, atau **Batal RSVP**.
Satu anggota hanya memiliki satu pilihan aktif dan kapasitas hanya menghitung pilihan
Hadir. Event mengirim reminder tanpa mention pada jendela 24 jam dan 1 jam, lalu
menutup RSVP otomatis saat waktu mulai. Owner dapat membatalkan event dari panel
privat. State disimpan di `data/events-state.json`; detail teknis dan recovery ada di
`docs/EVENT-HUB.md`.

Canox juga dapat memasukkan event hasil percakapan/riset melalui inbox terpisah
`data/canox-event-inbox.json`. Inbox ini hanya membuat panel privat dan tidak memiliki
aksi Publish. Payload wajib ditulis memakai temporary file lalu atomic rename:

```json
{
  "events": [{
    "id": "event-request-unik-001",
    "title": "AI Community Meetup",
    "description": "Diskusi AI terapan untuk komunitas.",
    "start_at": "2026-08-02T19:00:00+07:00",
    "location": "General Voice",
    "capacity": 30,
    "source_url": "https://example.com/events/ai-meetup"
  }]
}
```

ID harus unik; waktu wajib masih di masa depan dan memiliki zona waktu. Kapasitas
opsional dibatasi 2-500, sedangkan referensi opsional hanya menerima HTTP(S) tanpa
credential. Seluruh payload gagal bila satu entry tidak valid. File processing yang
tertinggal akibat crash dipulihkan saat startup dan external ID mencegah panel ganda.

### Restricted document translation

Gunakan:

```text
/translate file:<attachment> to:<bahasa> non_sensitive:true
```

DeepL mendeteksi bahasa sumber otomatis. Bahasa tujuan dipilih lewat autocomplete; `Indonesian (ID)` menerjemahkan semua bahasa sumber yang didukung akun DeepL ke bahasa Indonesia. Bahasa di luar daftar dukungan DeepL tetap tidak dapat diproses.

Fitur ini memakai runtime allowlist `TRANSLATE_ALLOWED_USER_IDS`; `OWNER_ID` selalu otomatis diizinkan. Semua respons dan hasil bersifat ephemeral. File hanya berada di folder temp selama proses, tidak dicatat ke log, dan dihapus setelah hasil selesai di-upload.

Karena key saat ini DeepL API Free, command hanya untuk dokumen **non-sensitif**. Jangan unggah data pribadi, kontrak, keuangan, credential, medis, atau rahasia kerja. DOCX/PPTX/PDF juga memakai minimum kuota 50.000 karakter per file. Detail validasi ada di `docs/DEEPL-DOCUMENT-VALIDATION.md`.

### Incident Report Hub

Semua member server dapat memakai `/report`. Hasil command selalu ephemeral dan panel
review hanya dikirim ke `MOD_LOG_CHANNEL_ID`; tidak ada fallback berdasarkan nama
channel. Sebelum fitur dipakai, pastikan `@everyone` tidak memiliki **View Channel**,
bot memiliki View Channel, Send Messages, Embed Links, Attach Files, dan Read Message
History, lalu isi `REPORT_MODERATOR_ROLE_IDS` bila reviewer selain owner diperlukan.
Role ini sengaja terpisah dari `OPS_EDITOR_ROLE_IDS`.

Pilihan `anonymous:true` menyembunyikan identitas pelapor dari panel bersama dan
moderator. `OWNER_ID` tetap dapat memakai **Reveal Reporter** secara ephemeral; tindakan
reveal dicatat tanpa menyalin identitas ke audit. Administrator Discord tetap merupakan
pihak tepercaya karena permission Administrator dapat melewati overwrite channel.

Bukti dibatasi ke PNG/JPEG/WEBP/GIF, MP4/WEBM, PDF, atau TXT, maksimum 8 MiB atau batas
lebih kecil dari konfigurasi/Discord. File divalidasi sebelum diunggah ulang ke panel
privat dan file sementara lokal selalu dibersihkan. Laporan selesai disimpan selama
`REPORT_RETENTION_DAYS` (default 30 hari), lalu panel dan state dihapus dengan recovery
jika Discord sementara gagal. Hengs tidak mengirim DM, pengumuman publik, atau hukuman
otomatis; keputusan tetap pada manusia. Kontrak operator lengkap ada di
[`docs/REPORT-HUB.md`](docs/REPORT-HUB.md).

### Private WhatsApp recovery alerts

Hengs Discord membaca antrean lokal atomik dari Hengs WhatsApp. Alert dikirim ke DM
`OWNER_ID` terlebih dahulu; bila DM gagal, fallback hanya boleh ke channel persis
`BOT_SETTINGS_CHANNEL_ID` di `DISCORD_GUILD_ID`. Bot tidak mencari channel berdasarkan
nama dan tidak pernah jatuh ke channel publik.

Event yang didukung hanya `QR_REQUIRED`, `AUTH_FAILED`, `RECOVERY_RESTART`, dan
`CONNECTED`. Konsumer menggabungkan event yang terselesaikan saat Discord offline,
menahan duplikat, memakai retry terbatas, dan hanya mengirim notifikasi pulih setelah
masalah sebelumnya benar-benar terkirim. Gambar QR, isi chat, nomor kontak, token, path,
dan raw error tidak pernah masuk antrean atau pesan Discord. Lokasi default bersama adalah
`HenryLabs/Hengs/.runtime/wa-recovery-alerts`; `HENGS_ALERT_BRIDGE_DIR` hanya untuk
override lokal lanjutan.

### Deterministic Anti-Raid

Anti-Raid bukan pengganti `/report`. Report Hub tetap jalur review manusia untuk
harassment, percakapan ambigu, dan laporan komunitas; tidak ada hukuman otomatis dari
laporan. Anti-Raid hanya bereaksi pada aturan deterministik berkeyakinan tinggi untuk
domain yang diblokir, pengulangan lintas channel, atau banjir attachment. Ia tidak
mengirim isi pesan, attachment, atau URL ke AI, layanan reputasi URL, Canox, maupun
Hengs WhatsApp.

Sebelum mode `active` dipakai, isi `OWNER_ID`, `MOD_LOG_CHANNEL_ID`, dan bila perlu
`MODERATION_ROLE_IDS` / `ANTI_RAID_BLOCKED_DOMAINS`. `mod-logs` harus privat dari
`@everyone`; bot memerlukan View Channel, Send Messages, Embed Links, Read Message
History, Ban Members, dan Manage Messages. Bila salah satu prasyarat keamanan gagal,
Hengs berubah menjadi monitor-only dan tidak melakukan penghapusan atau ban.

`/mod status` menampilkan Mode tersimpan dan Mode efektif, label prasyarat aman,
snapshot tracker (guild/member/observasi), serta hitungan final insiden. `/mod incidents`
menampilkan hingga 10 insiden per halaman dengan usia, member ID non-mention,
trigger/status, jumlah pesan/kanal yang dibatasi, dan link panel hanya bila ID valid.
Tombol Sebelumnya, Segarkan, dan Berikutnya memeriksa ulang izin serta menjepit halaman
yang sudah kedaluwarsa. Owner mengatur pengecualian melalui `/mod allow`; aksi `list`
menampilkan maksimal 10 nilai aman. Moderator yang didaftarkan hanya dapat melihat
status dan insiden. Panduan ambang, privasi, recovery, dan acceptance live tersedia di
[`docs/ANTI-RAID.md`](docs/ANTI-RAID.md).

### Private moderation queue

Gunakan `/reports` untuk melihat laporan berstatus open atau claimed. Command ini hanya
dapat dipakai `OWNER_ID` dan role dalam `REPORT_MODERATOR_ROLE_IDS`; izin diperiksa
lagi pada setiap Cek Lagi, Sebelumnya, dan Berikutnya. Saat antrean kosong, copy menjelaskan
bahwa belum ada laporan dan apa yang perlu dilakukan berikutnya. Hanya owner yang melihat
**Lihat Contoh**. Preview tersebut memakai data sintetis tetap, tetap ephemeral, tidak
membaca atau menulis state laporan, tidak mengirim panel ke mod-log, dan tidak menyediakan
tombol tindakan moderator.

Antrean menampilkan maksimum 10 laporan per halaman, diurutkan dari yang paling lama.
Priority hanya menjadi tie-break untuk waktu yang sama: Mendesak, Penting, lalu Normal.
Default category adalah Penting untuk harassment, spam/scam, dan inappropriate; category
lain dimulai dari Normal. Reviewer dapat mengganti priority lewat panel dengan revision
compare-and-set sehingga klik lama atau dua moderator bersamaan tidak menimpa state baru.

Queue hanya memuat Report ID, status, priority, category, usia relatif, claimant, dan
tautan panel yang tervalidasi. Detail laporan, pelapor, target, link pesan, bukti, final
note, dan audit tidak masuk queue. Semua respons bersifat ephemeral, pagination dibatasi,
dan mention parsing dimatikan.

Anti-Raid adalah boundary terpisah v1.13.0 yang sudah tersedia secara lokal. Ia tidak mengubah alur Report Hub: laporan tetap human review, sedangkan enforcement Anti-Raid hanya mengikuti trigger deterministik dan prasyarat fail-closed.

---

Dibuat oleh **Henry** · untuk server komunitas Henzzz.
