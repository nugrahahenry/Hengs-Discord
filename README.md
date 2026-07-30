# 🤖 Hengs Discord Bot — Henzzz

> Bot komunitas serba-bisa untuk server Discord: AI chat, mode fokus, welcome card custom, reaction roles, dan auto-setup struktur server.

## ✨ Fitur Utama

- **AI chat via mention** — tinggal mention bot, dia bales kontekstual (history per user)
- **Mode fokus** — `/study on/off/status`, `/scrim on/off`
- **Utility** — `/announce`, `/fun` (quote · 8ball · roll · flip · meme)
- **Ops Hub** — `/ops draft` menyusun pengumuman dengan AI, lalu owner review lewat tombol Publish / Discard di `🎛️・bot-settings`
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
│   ├── commands/           # admin, announce, fun, scrim, study, voice
│   └── utils/
│       ├── welcome-card.js # render welcome/leave card (canvas)
│       └── role-store.js   # persistensi reaction roles
├── docs/                   # SETUP.md, dll
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

Hengs hanya menaruhnya sebagai draft di `🎛️・bot-settings`. Pengumuman baru tayang ke `#announcements` setelah owner menekan **Publish**. Isi `OWNER_ID` dan, agar penargetan selalu pasti, `BOT_SETTINGS_CHANNEL_ID` di `.env`.

Token Discord = **rahasia**. Kalau pernah ke-share di mana pun (chat, screenshot, commit), langsung **Reset Token** di Developer Portal. File `.env` & folder `data/` otomatis di-ignore Git.

---

Dibuat oleh **Henry** · untuk server komunitas Henzzz.
