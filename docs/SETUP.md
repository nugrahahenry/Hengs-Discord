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
```

> Auto-setup struktur server: jalanin `/admin setup` di server (bikin channel & kategori otomatis).

## 🔐 Catatan keamanan

- Token bocor (ke-share di chat/screenshot/commit)? **Langsung Reset Token** di Developer Portal, update `.env`.
- File `.env` & folder `data/` otomatis di-ignore Git — aman dari ke-push nggak sengaja.
