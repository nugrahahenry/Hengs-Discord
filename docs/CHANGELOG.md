# Changelog — Discord Bot "Hengs"

Format: [Keep a Changelog](https://keepachangelog.com/id/1.1.0/) · Versi: [SemVer](https://semver.org/lang/id/).
Lihat aturan lengkap di `../../../../KONVENSI-VERSI.md`.

## [Unreleased] - 1.1.1

### Fixed
- Publish/Discard sekarang memakai transisi state sinkron `pending → publishing → published`, sehingga klik ganda atau dua interaction bersamaan tidak dapat mengirim pengumuman duplikat.
- Draft yang sudah terkirim tetapi proses mati sebelum finalisasi dipulihkan saat startup melalui marker Draft ID di embed announcements.
- State JSON yang rusak sekarang gagal tertutup dan tidak lagi dianggap sebagai state kosong yang dapat menimpa riwayat draft.
- Pemrosesan inbox Canox memakai mutex, nama processing unik, external ID wajib, dan cleanup file sukses untuk mencegah overlap serta duplikasi.
- File inbox Canox berstatus `processing` yang tertinggal akibat crash dipulihkan saat startup sehingga draft tidak hilang senyap.
- Single-instance lock mencegah dua proses Hengs Discord memakai token dan Ops state yang sama secara bersamaan.
- Panel yang gagal disimpan dihapus kembali agar tidak meninggalkan tombol yatim.
- Judul/body divalidasi terhadap batas embed Discord; draft kosong ditolak.
- Tombol draft lama dengan ID 12 karakter tetap kompatibel; draft baru memakai ID 16 karakter.

### Security
- Runtime owner check tetap wajib pada slash command dan tombol; `/ops` tidak tersedia melalui DM.
- Ruang review tidak lagi fallback ke `BOT_CHANNEL_ID`; hanya ID eksplisit atau nama persis `🎛️・bot-settings`/`bot-settings` yang diterima.
- Announcement tetap memakai `allowedMentions: { parse: [] }` sehingga draft AI/Canox tidak dapat memicu mass mention.

### Tests
- Ditambahkan test Node bawaan untuk idempotensi external ID, single publish claim, transisi publish/discard, validasi dan crash recovery inbox Canox, pemilihan review channel, serta corrupt-state fail-closed.

## [1.1.0] - 2026-07-30

### Added
- Ops Hub: `/ops draft`, `/ops status`, panel approval owner, penyimpanan draft lokal, dan inbox file Canox.

### Note
- Commit `5b7e604` berjudul "Add private document translation", tetapi diff commit tersebut sebenarnya berisi Ops Hub dan migrasi model AI. Implementasi document translation belum ada di tree checkpoint ini.

## [0.6.0] - 2026-06-28
### Fixed
- **Reaction roles MATI total → IDUP**: `partials` nggak di-set di Client → event reaksi di pesan lama nggak nyampe. Ditambah `partials` + fetch partial message. (`src/index.js`)
- **`/announce` bisa gagal senyap**: tambah `deferReply` (cegah timeout 3 dtk) + try/catch di `channel.send`. (`src/commands/announce.js`)
- `role-store.save()` dibungkus try/catch (cegah corrupt JSON reaction-roles senyap). (`src/utils/role-store.js`)
- Error yang ketelen dikasih logging: getroles cleanup, webhook setup, `/fun quote`. (`admin.js`, `fun.js`)
- AI chat: user-turn baru di-commit ke history HANYA kalau model sukses (cegah turn yatim) + 401 OpenRouter langsung stop (nggak buang 70 dtk). (`src/agent.js`)
### Security
- **`/announce` `@everyone`** dikunci Administrator (dulu holder "Manage Messages" bisa mass-mention). (`src/commands/announce.js`)
- **AI chat**: rate-limit per-user (anti spam nguras kuota) + history key pakai **user-ID** (bukan username) + cap memori (anti leak) + aturan anti prompt-injection. (`src/agent.js`)
- **`/admin restart`** ditambah guard `OWNER_ID` server-side (`defaultMemberPermissions` cuma petunjuk UI). Set `OWNER_ID` di `.env`. (`src/commands/admin.js`)
- `npm audit fix` + discord.js udah v14 terbaru (14.26.4) → sisa 4 vuln (undici, transitif) DIBIARKAN: nggak langsung exploitable, nutupnya butuh upgrade ke v15 yang breaking.
- Polish robustness: log URL avatar pas timeout, try/catch `/admin rules`+`serverinfo` send, voice auto-rejoin cleanup pas channel kehapus. (`welcome-card.js`, `admin.js`, `index.js`, `voice.js`)

## [0.5.0] - 2026-06-24
### Added
- Titik awal pencatatan changelog. Bot sudah jalan (AI chat via mention, `/study` `/scrim`, `/announce`, `/fun`, `/admin setup/ids/rolereact/webhook/lockdown`, welcome/leave card, stats channels). Setup server & test welcome/roles masih pending — lihat `CLAUDE.md`.
