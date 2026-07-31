# 🤖 Hengs Discord Bot — Henzzz

> Bot komunitas serba-bisa untuk server Discord: AI chat, mode fokus, welcome card custom, reaction roles, dan auto-setup struktur server.

## ✨ Fitur Utama

- **AI chat via mention** — tinggal mention bot, dia bales kontekstual (history per user)
- **Mode fokus** — `/study on/off/status`, `/scrim on/off`
- **Utility** — `/announce`, `/fun` (quote · 8ball · roll · flip · meme)
- **Ops Hub** — `/ops draft` menyusun pengumuman dengan AI; owner dapat Edit, Perpendek, Regenerate, Publish, atau Discard dari `🎛️・bot-settings`
- **Restricted document translation** — `/translate` menerjemahkan PDF, DOCX, PPTX, HTML, atau TXT non-sensitif melalui DeepL, khusus owner/VIP
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
| `/ops draft` · `/ops status` | Draft pengumuman, approval owner, dan status operasional |
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
│   ├── translation/        # DeepL client, validasi, antrean, cleanup
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

Canox tidak boleh mem-posting ke channel publik secara langsung. Jika nanti Canox menemukan event atau menyusun pengumuman, ia dapat menulis draft ke `data/canox-ops-inbox.json`:

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

Hengs hanya menaruhnya sebagai draft di `🎛️・bot-settings`. Owner dapat mengubah manual lewat **Edit**, meminta AI **Perpendek** atau **Regenerate**, lalu memilih **Publish** atau **Discard**. Pengumuman baru tayang ke `#announcements` setelah owner menekan **Publish**. Isi `OWNER_ID`, `BOT_SETTINGS_CHANNEL_ID`, dan `ANNOUNCE_CHANNEL_ID` di `.env`. Jika ID ruang review belum diisi, fallback hanya menerima nama channel persis `🎛️・bot-settings` atau `bot-settings`—tidak pernah channel bot umum.

Setiap draft Canox wajib punya `id` unik. Canox harus menulis JSON ke file sementara terlebih dahulu, lalu melakukan rename atomik menjadi `canox-ops-inbox.json`; ini mencegah Hengs membaca file yang baru ditulis setengah. Ops Hub menyimpan status lokal di `data/ops-state.json`, menolak external ID yang sama, serta memakai lock terpisah untuk revisi dan publish. Selama AI merevisi, semua tombol dinonaktifkan; kegagalan atau restart mengembalikan draft asli ke status pending. Maksimal 20 versi sebelumnya disimpan lokal sebagai audit trail.

Untuk verifikasi lokal tanpa mendaftarkan command ke Discord:

```bash
npm test
```

Token Discord = **rahasia**. Kalau pernah ke-share di mana pun (chat, screenshot, commit), langsung **Reset Token** di Developer Portal. File `.env` & folder `data/` otomatis di-ignore Git.

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
