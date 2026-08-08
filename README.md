# 🤖 Hengs Discord Bot — Henzzz

> Bot komunitas serba-bisa untuk server Discord: AI chat, mode fokus, welcome card custom, reaction roles, dan auto-setup struktur server.

## ✨ Fitur Utama

- **AI chat via mention** — tinggal mention bot, dia bales kontekstual (history per user)
- **Mode fokus** — `/study on/off/status`, `/scrim on/off`
- **Utility** — `/announce`, `/fun` (quote · 8ball · roll · flip · meme)
- **Ops Hub** — `/ops draft` menyusun pengumuman dengan AI; editor allowlist dapat membuat dan merevisi draft, sedangkan owner memegang Publish Now, jadwal, pembatalan, dan Discard
- **Community Event Hub** — `/event draft` membuat event ber-approval dengan RSVP, kapasitas, reminder, cancel, dan auto-close
- **Restricted document translation** — `/translate` menerjemahkan PDF, DOCX, PPTX, HTML, atau TXT non-sensitif melalui DeepL, khusus owner/VIP
- **Runtime health contract** — heartbeat lokal atomik untuk status connected, reconnecting, stale, failed, dan recovery tanpa data privat
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

## 💬 Commands

| Command | Fungsi |
|---|---|
| `@Hengs <pesan>` | Ngobrol sama AI |
| `/study on/off/status` · `/scrim on/off` | Mode fokus |
| `/announce` · `/fun ...` | Pengumuman & hiburan |
| `/ops draft` · `/ops status` · `/ops history` | Draft pengumuman, approval owner, status, dan audit operasional |
| `/event draft` · `/event status` | Event komunitas dengan approval owner, RSVP, kapasitas, reminder, dan auto-close |
| `/translate file to non_sensitive:true` | Terjemahkan dokumen non-sensitif; bahasa sumber dideteksi otomatis |
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
│   ├── runtime/            # producer heartbeat dan kontrak health lokal
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

---

Dibuat oleh **Henry** · untuk server komunitas Henzzz.
