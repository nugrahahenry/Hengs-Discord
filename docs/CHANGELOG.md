# Changelog — Discord Bot "Hengs"

Format: [Keep a Changelog](https://keepachangelog.com/id/1.1.0/) · Versi: [SemVer](https://semver.org/lang/id/).
Lihat aturan lengkap di `../../../../KONVENSI-VERSI.md`.

## [Unreleased]

## [1.10.0] - 2026-08-09

### Added
- `/ops overview` sebagai Community Operations Dashboard privat untuk merangkum runtime,
  Ops Hub, Event Hub, antrean penerjemah, dan mode fokus.
- Snapshot read-only antrean penerjemah yang hanya mengembalikan configured, running,
  queued, depth, dan kapasitas.

### Security
- Akses dashboard memakai guard owner/editor Ops Hub yang sudah ada, respons ephemeral,
  dan mention parsing dinonaktifkan.
- Dashboard hanya memakai angka agregat dan enum allowlist. Isi draft/event, RSVP,
  identitas anggota, nama file, topik fokus, credential, path, dan raw error dibuang.
- Kegagalan satu store terisolasi sebagai kode `*_UNAVAILABLE`; dashboard tidak menulis
  atau memperbaiki state secara otomatis.

### Tests
- 59 test lulus, termasuk agregasi lintas-modul, privacy boundary, partial failure,
  permission command, respons ephemeral, dan snapshot antrean.
- Semua 36 file JavaScript lulus syntax check dan Git whitespace validation lulus.

## [1.9.0] - 2026-08-09

### Added
- Producer runtime health lokal di `data/runtime-health.json` dengan heartbeat 30 detik,
  versi, uptime, lifecycle koneksi Discord, dan kategori masalah terbatas.
- Kontrak consumer untuk status starting, connected, reconnecting, disconnected,
  degraded, invalidated, stopping, stopped, failed, serta deteksi stale 90 detik.

### Changed
- Login gagal, fatal process error, shutdown, shard disconnect/reconnect/resume, dan
  session invalidation sekarang memperbarui lifecycle snapshot sebelum proses berhenti
  atau launcher mencoba recovery.
- Single-instance lock sekarang menyegarkan timestamp setiap 30 detik dan memulihkan
  lock stale setelah lima menit. Ini menutup false-positive Windows `EPERM` pada PID
  yang sebenarnya sudah tidak ada tanpa melemahkan guard instance aktif.

### Security
- Snapshot ditulis lewat temporary file, flush, dan atomic rename; kegagalan I/O tidak
  menjatuhkan bot dan akan dicoba lagi pada heartbeat berikutnya.
- Token, API key, guild/channel/user ID, nama server, pesan, dokumen, draft, path, raw
  exception, dan stack trace tidak pernah masuk snapshot.

### Tests
- 55 test lulus, termasuk atomic write, stale/future timestamp, fail-closed schema,
  allowlisted issue code, I/O isolation, lifecycle disconnect/reconnect/recovery, lock
  stale, owner aktif, dan larangan proses lain melepas lock.
- Semua 34 file JavaScript lulus syntax check dan Git whitespace validation lulus.

## [1.8.0] - 2026-07-31

### Added
- Event Draft Editor privat dengan dua modal: **Edit Detail** untuk judul, deskripsi, waktu WIB, dan lokasi; **Kapasitas & Sumber** untuk kapasitas serta URL referensi.
- Nomor revisi persisten pada setiap draft dan panel untuk mencegah modal lama menimpa perubahan editor lain.
- Audit `event_edited` yang hanya menyimpan actor, revision, dan nama field tanpa menyalin isi event.

### Changed
- Owner dan role `OPS_EDITOR_ROLE_IDS` dapat merevisi draft Event Hub dari `bot-settings`; schema `/event` tidak berubah dan tidak memerlukan registrasi ulang.
- Panel draft menampilkan revisi aktif dan disinkronkan ulang setelah edit atomik.

### Security
- Hak edit diverifikasi ulang saat tombol dibuka dan modal disubmit. Publish, Discard, dan Cancel tetap owner-only.
- Edit ditolak setelah event meninggalkan status draft; URL, kapasitas, panjang teks, dan waktu masa depan divalidasi ulang di store.
- Compare-and-set revision menutup lost-update race dari dua modal yang dibuka bersamaan.

### Tests
- 46 test lulus, termasuk modal palsu tanpa izin, editor role, final-action guard, validasi kedua modal, stale revision, panel sync, dan larangan edit setelah publish claim.
- Semua file JavaScript lulus syntax check dan `git diff --check` lulus.

## [1.7.0] - 2026-07-31

### Added
- Inbox atomik `data/canox-event-inbox.json` untuk mengubah event hasil percakapan/riset Canox menjadi panel Event Hub privat.
- Referensi HTTP(S) opsional pada draft dan pesan event agar sumber hasil riset tetap dapat diperiksa sebelum dan setelah Publish.
- Startup recovery untuk file event Canox berstatus `processing` yang tertinggal akibat crash.

### Changed
- Event Hub menerima sumber Discord dan Canox melalui store/approval flow yang sama; schema slash command tidak berubah.

### Security
- Payload Canox diproses all-or-nothing, maksimal 10 event, dengan ID ketat, waktu masa depan berzona, panjang field terbatas, kapasitas 2-500, dan URL tanpa credential.
- Canox hanya dapat mengisi data draft. Status, actor final, publication, RSVP, reminder, dan channel tujuan tidak dapat dikendalikan melalui inbox.
- Publish, Discard, dan Cancel tetap diverifikasi terhadap `OWNER_ID`; seluruh output tetap menonaktifkan mention parsing.

### Tests
- 44 test lulus, termasuk contract inbox Canox, all-or-nothing validation, duplicate retry, private-only panel, source URL, timezone, dan stale processing recovery.
- Live acceptance lulus: sender produksi Canox membuat tepat satu panel privat, owner melakukan Discard, publication tetap null, tombol hilang, dan tidak ada file inbox/processing tersisa.

## [1.6.0] - 2026-07-31

### Added
- `/event draft` untuk membuat draft event privat dengan judul, deskripsi, waktu WIB, lokasi opsional, dan kapasitas opsional.
- `/event status` untuk melihat draft, event aktif, jumlah RSVP, event selesai, dan event dibatalkan.
- Panel approval Event Hub di `bot-settings`; editor dapat membuat draft sedangkan Publish Event, Discard, dan Batalkan Event tetap owner-only.
- Pesan event publik dengan RSVP eksklusif **Hadir**, **Mungkin**, dan **Batal RSVP**, termasuk penegakan kapasitas secara atomik.
- Reminder tanpa mention pada jendela 24 jam dan 1 jam, auto-close saat event dimulai, state persisten, serta pemulihan publish/reminder setelah restart.

### Fixed
- Race publish ganda, RSVP bersamaan, kapasitas penuh, cancel saat reminder sedang dikirim, dan stale message setelah crash ditutup oleh state claim sinkron serta `messageSyncPending` persisten.
- Crash setelah Discord menerima event tetapi sebelum state lokal final tidak mengirim event kedua; startup mencocokkan marker Event ID yang sudah terkirim.
- Draft yang jadwalnya sudah lewat tidak lagi dapat dipublikasikan; validasi dilakukan sebelum respons Discord dan di publish claim untuk menutup race waktu.

### Security
- Isi event tidak dapat memicu user, role, `@here`, atau `@everyone` mention karena seluruh publication/reminder memakai `allowedMentions: { parse: [] }`.
- RSVP publik hanya menyimpan Discord user ID secara lokal dan hanya menampilkan jumlah peserta; daftar identitas tidak dipublikasikan.
- Semua tindakan final diverifikasi ulang terhadap `OWNER_ID` saat tombol ditekan.

### Tests
- 41 test lulus, termasuk schema command, owner/editor guard, publish idempoten, penolakan draft kedaluwarsa, RSVP/capacity, cancel, reminder, auto-close, crash recovery, dan sinkronisasi panel/pesan publik.
- Live acceptance Discord lulus: satu RSVP Hadir tercatat, reminder satu jam terkirim tepat sekali, publikasi hanya satu, Cancel owner tersimpan, dan seluruh tombol panel/publik dinonaktifkan.

## [1.5.1] - 2026-07-31

### Added
- `npm run verify:server` untuk pemeriksaan Discord API read-only terhadap konfigurasi channel, permission, role hierarchy, owner, dan pesan reaction-role.
- Test render offline untuk welcome/leave card serta test auto-role dan hierarchy guard.

### Fixed
- Auto-role Member dan pembaruan statistik sekarang tetap berjalan jika `WELCOME_CHANNEL_ID` kosong, salah, atau welcome card gagal dikirim.
- Fallback role Member hanya menerima nama ternormalisasi yang persis `Member`, bukan role lain yang sekadar mengandung kata "member".
- Verifier memakai Windows system CA agar tetap mempertahankan validasi TLS saat koneksi lokal diintersepsi AVG.

### Operations
- Live server verification lulus tanpa failure/warning: owner, lima channel operasional, permission Manage Roles/Channels, hierarchy Member, dan tiga pesan reaction-role tervalidasi.
- `MEMBER_ROLE_ID` dan `ROLES_CHANNEL_ID` dikunci di `.env` lokal; autostart `HengsDC.lnk` dan restart satu-instance berhasil diverifikasi.
- 32 test lulus, welcome/leave PNG berhasil dirender, dan `npm audit --omit=dev` melaporkan 0 vulnerability.

## [1.5.0] - 2026-07-31

### Added
- Allowlist `OPS_EDITOR_ROLE_IDS` untuk moderator yang boleh membuat, melihat, mengedit, dan meminta revisi AI pada draft Ops Hub.
- `/ops history [limit]` untuk menampilkan 5–20 tindakan audit terbaru secara ephemeral.
- Audit persisten maksimal 500 tindakan yang menyimpan jenis tindakan, ID draft, pelaku, waktu, dan metadata operasional terbatas.

### Changed
- Gate tampilan `/ops` menggunakan permission Discord **Manage Messages**, lalu tetap diperketat oleh allowlist role/owner pada runtime.
- `/ops` dapat dijalankan dari channel operasional karena command memiliki runtime guard sendiri.

### Security
- Publish Now, Jadwalkan, Batalkan Jadwal, dan Discard tetap owner-only meskipun editor dapat melihat tombolnya.
- Role editor diverifikasi ulang pada setiap slash command, klik tombol, dan submit modal; role yang dicabut langsung kehilangan akses.
- Audit tidak menyalin judul, brief, atau isi draft dan output history menonaktifkan mention parsing.
- `OWNER_ID` tetap wajib; konfigurasi editor tidak dapat membuka Ops Hub bila owner belum dikonfigurasi.

### Tests
- 29 test lulus, termasuk editor allowlist, penolakan tindakan final, modal guard, schema `/ops history`, migrasi state lama, dan pemeriksaan bahwa isi draft tidak masuk audit.
- Live acceptance Discord lulus: draft privat dibuat, diedit, lalu di-Discard; `/ops history` menampilkan ketiga tindakan tanpa isi draft dan tanpa publication.

## [1.4.0] - 2026-07-31

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
