# Changelog — Discord Bot "Hengs"

Format: [Keep a Changelog](https://keepachangelog.com/id/1.1.0/) · Versi: [SemVer](https://semver.org/lang/id/).
Lihat aturan lengkap di `../../../../KONVENSI-VERSI.md`.

## [Unreleased] - 1.4.0

### Added
- Tombol owner-only **Jadwalkan** pada draft pending dengan input waktu WIB `HH:mm` atau `YYYY-MM-DD HH:mm`.
- Tampilan khusus draft terjadwal dengan waktu publikasi, jumlah percobaan, serta tombol **Publish Now**, **Batalkan Jadwal**, dan **Discard**.
- Worker jadwal persisten yang memeriksa draft jatuh tempo setiap 15 detik dan tetap melanjutkan jadwal setelah restart.

### Changed
- `/ops status` sekarang menampilkan jumlah draft terjadwal.
- Tombol Publish diberi label **Publish Now** untuk membedakan publikasi segera dari publikasi terjadwal.

### Fixed
- Klaim atomik `scheduled -> publishing` mencegah worker, klik Publish Now, atau dua tick scheduler mengirim draft yang sama dua kali.
- Kegagalan pengiriman terjadwal dicoba ulang setelah 1 menit dan 5 menit; setelah tiga kegagalan draft kembali ke pending untuk direview.
- Publish Now yang gagal pada draft terjadwal mengembalikan draft ke jadwal semula, bukan menghilangkan jadwal.
- Draft terjadwal yang dibatalkan atau dibuang menyimpan metadata jadwal terakhir untuk audit lokal.
- Pesan publik yang berhasil terkirim sebelum proses mati tetap dapat direkonsiliasi melalui marker Draft ID yang sudah ada.

### Security
- Jadwalkan, batalkan, Publish Now, dan Discard tetap memakai pemeriksaan runtime `OWNER_ID`.
- Publikasi otomatis tetap menonaktifkan seluruh mention sehingga isi draft tidak dapat memicu `@everyone`, role mention, atau user mention.

### Tests
- 25 test lulus, termasuk parser WIB, rollover besok, validasi tanggal, lifecycle jadwal, retry bertingkat, pembatalan, Publish Now, dan pengujian worker paralel tanpa duplicate publish.
- Live acceptance Discord lulus: draft privat berhasil dijadwalkan, panel berubah ke status terjadwal, jadwal dibatalkan kembali ke review, lalu draft di-Discard tanpa publication.

## [1.3.0] - 2026-07-31

### Added
- Tombol owner-only **Edit**, **Perpendek**, dan **Regenerate** pada setiap panel Ops Hub pending.
- Modal edit untuk mengubah judul dan isi tanpa membuat draft atau publication baru.
- Riwayat maksimal 20 versi sebelumnya per draft sebagai audit trail lokal.

### Changed
- `/ops status` sekarang menampilkan jumlah draft yang sedang direvisi.
- Panel pending lama disinkronkan saat startup sehingga memperoleh kontrol revisi terbaru.

### Fixed
- State transition `pending -> revising -> pending` mencegah Publish, Discard, atau revisi kedua berjalan bersamaan dengan panggilan AI.
- Revisi AI yang gagal mengembalikan draft asli beserta tombolnya dan tidak lagi dilaporkan sebagai sukses melalui fallback teks lama.
- Revisi yang terputus karena crash dipulihkan ke pending; startup juga memperbaiki panel bila proses mati setelah state tersimpan tetapi sebelum Discord selesai diperbarui.
- Submit modal lama tidak dapat menimpa draft yang sudah publishing, published, discarded, atau sedang direvisi.

### Security
- Semua tombol dan modal revisi tetap memakai runtime `OWNER_ID`; permission tampilan Discord tidak dijadikan satu-satunya guard.
- Prompt revisi memperlakukan brief dan isi draft sebagai data, mempertahankan fakta, serta melarang mention dan detail rekaan.

### Tests
- 20 test lulus, termasuk revision lock, stale modal, owner guard, revision history, AI failure rollback, crash recovery, dan startup panel refresh.
- Live acceptance Discord lulus: Regenerate dan Perpendek berhasil melalui Groq GPT-OSS 120B, dua versi tercatat, lalu draft uji di-Discard tanpa publication.

## [1.2.0] - 2026-07-31

### Added
- `/translate file:<attachment> to:<language> non_sensitive:true` untuk PDF, DOCX, PPTX, HTML, dan TXT dengan auto-detect bahasa sumber.
- Autocomplete bahasa tujuan dari DeepL, allowlist owner/VIP, antrean serial, progress ephemeral, timeout, serta pengecekan kuota sebelum upload.
- Client DeepL berbasis endpoint resmi dengan native `fetch` Node 24 untuk usage, languages, upload, polling, dan download dokumen.

### Security
- Konfirmasi non-sensitif wajib untuk DeepL API Free; dokumen personal/rahasia ditolak secara kebijakan dan peringatan selalu tampil.
- Validasi ekstensi, MIME, ukuran DeepL/Discord, Discord CDN HTTPS, signature PDF/OOXML, dan deteksi binary masquerading sebagai TXT/HTML.
- Nama file disanitasi; isi, filename, URL attachment, key, dan document handle tidak masuk log.
- Input/output memakai direktori temp unik dan selalu dihapus di `finally` setelah attachment hasil di-upload.
- `deepl-node` tidak dipakai di runtime karena dependency `adm-zip` memiliki advisory high; native client menghapus jalur rentan tersebut.

### Changed
- Dependency non-breaking diperbarui dan `npm audit --omit=dev` sekarang melaporkan 0 vulnerability.

### Tests
- 14 test lulus untuk Ops Hub, allowlist/schema command, format/MIME/size/CDN validation, bounded download, file signature, filename sanitization, bahasa tujuan, antrean serial, dan native DeepL client.
- Integrasi TXT end-to-end dengan client produksi berhasil (upload, polling, download, 29 billed characters, cleanup temp).
- Live acceptance Discord berhasil: `/translate` mengembalikan attachment TXT bahasa Indonesia secara ephemeral, melaporkan 141 billed characters, dan tidak meninggalkan direktori temp.

### Research
- DeepL Document Translation divalidasi langsung dengan key API aktif: TXT EN -> ID berhasil, penggunaan terukur, dan cleanup file sementara terverifikasi.
- Dicatat batas format/ukuran, minimum billing 50.000 karakter untuk DOCX/PPTX/PDF, serta batas privasi API Free sebelum implementasi `/translate`.

## [1.1.1] - 2026-07-31

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
