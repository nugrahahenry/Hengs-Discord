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

Untuk Ops Hub, isi tiga nilai berikut:

- `OWNER_ID` — User ID Henry; hanya ID ini yang boleh membuat, mengedit, merevisi, publish, atau discard draft.
- `BOT_SETTINGS_CHANNEL_ID` — channel privat `🎛️・bot-settings` untuk review draft.
- `ANNOUNCE_CHANNEL_ID` — channel publik tujuan pengumuman.

Ops Hub sengaja tidak memakai `BOT_CHANNEL_ID` sebagai fallback ruang review.

Setelah `/ops draft`, panel privat menyediakan:

- **Edit** — ubah judul dan isi melalui modal.
- **Perpendek** — AI meringkas tanpa membuang tanggal, tautan, syarat, atau call-to-action.
- **Regenerate** — AI membuat versi alternatif dari brief dan draft saat ini.
- **Publish / Discard** — finalisasi tetap hanya oleh owner.

Revisi AI mengunci draft sementara agar tidak dapat dipublish bersamaan. Bila proses gagal atau bot restart, draft asli dipulihkan otomatis.

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
```

> Auto-setup struktur server: jalanin `/admin setup` di server (bikin channel & kategori otomatis).

## 🔐 Catatan keamanan

- Token bocor (ke-share di chat/screenshot/commit)? **Langsung Reset Token** di Developer Portal, update `.env`.
- File `.env` & folder `data/` otomatis di-ignore Git — aman dari ke-push nggak sengaja.
