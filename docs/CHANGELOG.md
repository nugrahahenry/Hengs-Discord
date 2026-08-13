# Changelog — Discord Bot "Hengs"

Format: [Keep a Changelog](https://keepachangelog.com/id/1.1.0/) · Versi: [SemVer](https://semver.org/lang/id/).
Lihat aturan lengkap di `../../../../KONVENSI-VERSI.md`.

## [Unreleased]

## [1.17.2] - 2026-08-13

### Fixed
- Mutating `LaunchInstance` calls now pass OCI CLI `--no-retry`, preventing one acquisition
  invocation from being resubmitted implicitly by the CLI.
- Unmapped structured provider failures now become fixed non-retryable
  `PROVIDER_UNAVAILABLE` or `PROVIDER_ERROR` results instead of another ambiguous `UNKNOWN`.

### Security
- Provider codes, messages, stdout, stderr, identifiers, and request metadata remain absent
  from operator output and persisted acquisition state.
- Only trusted structured `OutOfHostCapacity` remains retryable. New provider buckets stop
  acquisition and require review; legacy `UNKNOWN` entries remain readable.

### Verification
- TDD regression started with four expected failures, then the focused OCI suite passed
  27/27 and the full suite passed 334/334.
- All 87 JavaScript files passed syntax checks; `git diff --check` passed and the production
  dependency audit found 0 vulnerabilities.
- Read-only Oracle Audit evidence showed that the previous second authorized CLI invocation
  produced three `LaunchInstance.begin` events under the old default retry behavior. A fresh
  instance list still found zero `hengs-discord` instances.
- No third acquisition attempt, VM creation, command registration, runtime restart, secret
  transfer, deployment, or cutover was performed in this checkpoint.

## [1.17.1] - 2026-08-13

### Fixed
- Diagnostik OCI sekarang membedakan `TIMEOUT`, `CLI_ERROR_UNSTRUCTURED`, dan
  `CLI_OUTPUT_INVALID`; error CLI tidak terstruktur dan output JSON rusak tidak lagi
  digabung menjadi `UNKNOWN`.

### Security
- Raw stdout, stderr, dan pesan error OCI tidak masuk ke hasil operator atau state acquisition;
  hanya kode tetap yang disimpan.
- Kode legacy `UNKNOWN` tetap diterima agar state attempt historis dapat dibaca tanpa reset
  atau migrasi yang berisiko.

### Verification
- Full `npm test`: 333 passed, 0 failed; focused OCI diagnostics: 26 passed, 0 failed.
- Seluruh 86 file JavaScript lulus syntax check; production dependency audit menemukan
  0 vulnerability; `git diff --check` lulus.
- Tidak ada command registration, runtime restart, public message, report-state mutation,
  attempt OCI kedua, pembuatan VM, token transfer, atau deployment dalam patch ini.

## [1.17.0] - 2026-08-13

### Added
- Owner-only **Lihat Contoh** pada antrean `/reports` yang kosong. Preview memakai data
  sintetis tetap dan renderer embed produksi tanpa kontrol tindakan moderator.

### Changed
- Empty state menjelaskan bahwa server sedang tenang, tempat laporan baru muncul, dan aksi
  **Cek Lagi**. Antrean aktif merangkum jumlah menunggu/ditangani serta langkah berikutnya.
- Label metadata antrean menggunakan bahasa yang lebih natural tanpa menambah detail privat.
- Metadata package, release builder, test fixture, README, dan cloud runbook disinkronkan ke
  v1.17.0. Schema slash command tetap sama sehingga registrasi ulang tidak diperlukan.

### Security
- `reports:preview` dicocokkan secara persis dan memeriksa ulang `OWNER_ID` saat tombol
  dikirim. Forged moderator preview gagal secara privat.
- Preview hanya memperbarui respons ephemeral yang sudah ada, menonaktifkan mention parsing,
  tidak membaca/menulis report store, tidak masuk audit/statistik, dan tidak mengirim panel
  publik atau mod-log.

### Verification
- Full `npm test`: 330 passed, 0 failed; focused Report Center: 14 passed, 0 failed; seluruh
  empat file JavaScript yang berubah lulus syntax check.
- Production dependency audit found 0 vulnerabilities.
- `git diff --check` lulus dan Impeccable interface detector melaporkan nol temuan.
- Targeted code/security review tidak menemukan Critical atau Important issue. Dua temuan
  minor ditutup dengan timestamp sintetis tetap dan test yang memaksa preview bebas store-read.
- Tidak ada command registration, runtime restart, public message, state mutation, atau cloud
  deployment dalam checkpoint ini.

## [1.16.0] - 2026-08-13

### Added
- Owner-only `/mod preview` renders a clearly labeled ephemeral incident example without
  persistence, statistics, mod-log delivery, detection, deletion, or ban side effects.
- Active enforcement now requires a second revision-bound Owner confirmation.

### Changed
- `/mod status` leads with the effective consequence and explains fail-safe fallback from
  requested Active to Monitor.
- Empty incident queues follow the effective mode, hide pagination noise, and expose only
  a `Cek Lagi` refresh action.
- Incident cards, mode controls, allowlist choices, mutation feedback, and recovery copy
  use concise Indonesian language while preserving mention-safe metadata boundaries.
- Monitor cards now say enforcement was not attempted instead of presenting false failure
  outcomes. Long valid allowlists are split across Discord-safe field sizes.
- Confirmed Active changes recheck the effective mode before reporting success; unsafe
  prerequisites are reported as a saved Active request that remains effectively Monitor.
- Configured Off remains effectively Off even when enforcement prerequisites are unavailable.

### Security
- Preview authorization is checked in both command and hub layers. Forged, malformed,
  stale, and unauthorized confirmation or cancellation controls fail closed.
- Mode-store failures acknowledge component interactions with sanitized recovery guidance
  instead of exposing errors or leaving Discord interactions unanswered.
- No moderation store schema changes were introduced; synthetic preview data cannot enter
  real incident or audit paths.

### Verification
- Full `npm test`: 326 passed, 0 failed; focused Moderation Center suite: 108 passed,
  0 failed; all 87 JavaScript files passed syntax checks.
- Production dependency audit found 0 vulnerabilities. The official credential scanner
  accepted all 14 changed tracked files, and `git diff --check` passed.
- Impeccable interface detector reported no findings. Targeted code and security re-review
  reported no remaining Critical or Important findings.
- Discord registered 12 guild commands; remote `/mod` includes `status`, `incidents`,
  `preview`, and `allow`. The runtime restarted as one connected v1.16.0 process with an
  advancing heartbeat and Anti-Raid still at Monitor revision 0.
- Read-only server verification passed with 0 failures and 0 warnings. No deployment, public
  message, allowlist mutation, or live Active-mode testing was performed.

## [1.15.1] - 2026-08-12

### Fixed
- OCI acquisition config now accepts either a regular compartment OCID or the root
  tenancy OCID, matching Oracle's valid compartment target behavior.
- Release metadata and archive naming are aligned to `1.15.1`.

### Security
- OCI CLI can use a dedicated trusted CA bundle for antivirus/proxy interception;
  TLS verification remains enabled and no bypass is introduced.

### Verification
- Real read-only OCI preflight passed against the configured home region, subnet,
  Ubuntu ARM image, availability domain, and A1 Flex shape.
- Acquisition remains `NOT_STARTED` with zero attempts; no VM or provider resource
  was created.

## [1.15.0] - 2026-08-12

### Added
- Bounded Oracle Always Free acquisition policy with privacy-safe atomic state, strict lock ownership, read-only preflight, and structured capacity-only retry.
- Reproducible release builder from committed `HEAD`, persistent-state snapshot/restore, encrypted export, hardened systemd unit, immutable deploy, health inspection, and rollback scripts.
- Public operator runbook in `docs/CLOUD-DEPLOY.md`.

### Changed
- Runtime target is pinned to Node.js 22 and release metadata is aligned at `1.15.0`.
- Instance-lock path and WhatsApp recovery-alert consumer can be configured for Linux while local Windows defaults remain unchanged.

### Security
- Releases reject secret/private paths, credential signatures, OCI identifiers, unsafe archive entries, symlinks, checksum mismatch, and dirty tracked trees.
- Cloud secrets remain outside release archives at `/etc/hengs/discord.env`; state is isolated under `/var/lib/hengs-discord/data` and off-VM backups require `age` encryption.
- Cutover requires one Discord token consumer. Anti-Raid remains in `monitor` mode and slash-command registration is unchanged.

### Verification
- Full `npm test`: 308 passed, 0 failed; focused cloud suite and all JavaScript syntax checks pass.
- All four Linux scripts pass `bash -n` through Git Bash. ShellCheck and `systemd-analyze verify` remain Ubuntu-host validation gates.
- Security review identified four High findings; all were closed with regression tests: restore ownership/modes, pre-cutover service enablement, dependency access to production state, and credential scan coverage.
- No VM, provider resource, deployment, Discord restart, command registration, or production cutover was performed in this checkpoint.


## [1.14.0] - 2026-08-11

### Added
- Private owner-first recovery alerts for Hengs WhatsApp lifecycle events.
- Exact private bot-settings fallback when owner DM delivery fails.
- Atomic local queue consumer with schema validation, stale-claim recovery, bounded retry, handled-ID deduplication, and rejected-event quarantine.

### Changed
- Discord lifecycle now starts the WhatsApp recovery consumer after ClientReady and stops it before graceful or fatal client destruction.

### Security
- Alerts are fixed mention-safe messages and accept only the four allowlisted lifecycle codes.
- Fallback fails closed unless the configured channel exactly matches `BOT_SETTINGS_CHANNEL_ID` and `DISCORD_GUILD_ID`.
- QR images, chat content, contact identifiers, tokens, paths, and raw errors are excluded.

### Verification
- Recovery state and consumer tests: 16 passed, 0 failed.
- Full Discord suite: 245 passed, 0 failed; all 66 JavaScript source/test files passed syntax checks.
- No Discord restart, command registration, live message, or live event injection was performed.


## [1.13.0] - 2026-08-11

### Added
- Deterministic Anti-Raid untuk blocked domain, repeated cross-channel content,
  single-channel link/attachment burst, dan cross-channel attachment flood tanpa AI.
- `/mod status`, `/mod incidents [page]`, dan owner-only `/mod allow` dengan respons
  ephemeral mention-safe.
- Kontrak operator publik di `docs/ANTI-RAID.md`.

### Changed
- `/mod incidents` sekarang memuat hingga 10 item per halaman dengan Previous, Refresh,
  Next, runtime authorization ulang, dan stale-page clamping.
- State menggunakan `schemaVersion: 1`; state legacy `schema: 1` divalidasi dan dimigrasi.
- Private incident card menampilkan hasil ban dan penghapusan secara eksplisit.

### Fixed
- Pesan raid yang sudah match tetap dihentikan sebelum AI saat persistence, capacity,
  enforcement, finalization, atau card delivery gagal.
- Capacity hanya mengevakuasi insiden final yang panel privatnya sudah persisten;
  evidence recovery tanpa panel dipertahankan atau creation gagal dengan fixed code.
- URL dengan credential atau port non-default tetap terdeteksi sebagai link dan dapat
  memicu blocked-host/burst, tanpa memakai domain allowlist sebagai trust bypass.
- Startup memulihkan insiden `detected` maupun `enforcing`; maintenance panel terus retry
  secara idempotent tanpa duplicate ban atau duplicate card.
- Referensi pesan fallback memiliki TTL 120 detik yang independen dari traffic dan
  dibersihkan setelah insiden selesai.
- Match pada window menit bersebelahan untuk member yang sama memakai satu incident,
  sehingga handler paralel tidak menghasilkan ban atau card ganda.

### Security
- State, audit, kartu, queue, dan log normal tidak menyimpan atau menampilkan content,
  URL/domain, attachment metadata, raw exception, atau mention aktif.
- System message, bot, webhook, DM, owner, administrator, reviewer, serta allowlist
  tervalidasi tetap exempt. Prasyarat permission/hierarchy gagal menjadi monitor-only.

### Verification
- `package.json` dan lockfile: `1.13.0`.
- Moderation tests: 95 lulus, 0 gagal.
- Full `npm test`: 229 lulus, 0 gagal.
- Syntax check seluruh JavaScript: lulus.
- `npm audit --omit=dev`: 0 vulnerability.
- `git diff --check`: lulus; warning LF/CRLF hanya normalisasi line ending.

### Live Acceptance
- Lulus 11 Agustus 2026: 12 guild command terdaftar dan `/mod` tersedia dengan
  `status`, `incidents`, serta `allow`.
- Runtime v1.13.0 online sebagai tepat satu instance. Owner smoke test membuka status
  `monitor/monitor`, prasyarat `Siap`, kontrol owner, dan antrean insiden.
- Smoke test tidak mengirim pesan publik, tidak menjalankan ban, dan tidak mengubah
  allowlist. Active auto-ban tetap tidak diuji tanpa akun dummy disposable.

### Next
- Jalankan mode `monitor` selama 1-2 hari dan tinjau `/mod incidents` untuk false positive.
- Aktifkan enforcement produksi hanya setelah hasil monitor dinilai aman.
- Checkpoint: `Hengs Discord v1.13.0: Add deterministic Anti-Raid`.

## [1.12.0] - 2026-08-09

### Added
- `/reports` sebagai antrean laporan aktif privat untuk owner dan role
  `REPORT_MODERATOR_ROLE_IDS`, dengan maksimum 10 item per halaman serta kontrol
  Refresh, Sebelumnya, dan Berikutnya.
- Priority persisten Normal, Penting, dan Mendesak pada setiap laporan, lengkap dengan
  sumber default category atau override moderator.

### Changed
- Laporan open/claimed diurutkan paling lama terlebih dahulu. Priority menjadi
  tie-break deterministik bila waktu pembuatan sama.
- Category harassment, spam/scam, dan inappropriate dimulai sebagai Penting; category
  lain dimulai sebagai Normal. Reviewer dapat mengubah priority dari panel privat.
- Panel laporan sekarang menampilkan priority aktif dan revision-safe controls.

### Security
- Queue hanya menampilkan Report ID, status, priority, category, usia relatif,
  claimant, dan tautan panel tervalidasi. Detail, pelapor, target, link pesan, bukti,
  final note, dan audit tidak dimasukkan.
- Runtime owner/moderator authorization diperiksa pada command dan setiap tombol queue.
  Respons selalu ephemeral, page dibatasi, dan mention parsing dimatikan.
- Kegagalan `/reports` dicatat sebagai fixed error code tanpa raw exception yang dapat
  membawa data laporan.

### Fixed
- Migrasi state legacy menambahkan kedua field priority secara atomik tanpa menaikkan
  revision; state parsial atau priority invalid tetap gagal tertutup.
- Perubahan priority memakai revision compare-and-set dan mempertahankan sync-pending
  bila edit panel Discord gagal, sehingga recovery startup tetap dapat memperbaikinya.
- Routing `report:` dan `reports:` dipisahkan agar forged component tidak berpindah
  ke handler yang salah.

### Tests
- 134 test lulus, termasuk legacy migration, category default, two-moderator race,
  forged component, queue privacy, pagination/clamping, permission recheck, panel-link
  validation, sync recovery, command wiring, dan safe logger placement.
- Semua 49 file JavaScript lulus syntax check, `git diff --check` lulus, dan
  `npm audit --omit=dev` melaporkan 0 vulnerability.
- Verifikasi Discord read-only dari main state lulus dengan 0 failure dan 0 warning.

### Operations
- Sebelas guild slash command, termasuk `/reports`, berhasil didaftarkan dan schema
  remote `/reports` terverifikasi tanpa opsi tambahan.
- Hengs Discord restart sebagai tepat satu instance v1.12.0 dan runtime health mencapai
  status connected dengan heartbeat aktif.
- Live owner acceptance lulus untuk empty queue, pembuatan laporan teknis non-sensitif,
  panel privat, default priority Normal, override ke Penting, queue metadata-only,
  Claim, serta penghapusan panel dan state uji.
- Outsider denial, pagination lebih dari 10 item, stale-button rejection, dan validasi
  target panel tetap diverifikasi oleh automated tests; acceptance live tidak membuat
  akun atau laporan dummy tambahan hanya untuk mengulang cakupan tersebut.

### Next
- Anti-Raid tetap fase terpisah v1.13.0. Checkpoint ini tidak menghapus pesan, memberi
  timeout, kick, ban, atau mengambil tindakan moderasi otomatis.

## [1.11.0] - 2026-08-09

### Added
- `/report` sebagai intake laporan insiden privat untuk seluruh member dengan kategori,
  detail, member terkait, link pesan satu server, bukti opsional, dan mode anonim.
- Panel moderator privat dengan Claim, Release Claim, Resolve, Dismiss, serta kontrol
  owner-only Reopen, Reveal Reporter, dan Purge.
- State laporan atomik, idempotensi interaction ID, batas tiga laporan aktif per
  pelapor, cooldown 60 detik, audit minim konten, dan retention default 30 hari.
- Pipeline bukti terverifikasi untuk PNG/JPEG/WEBP/GIF, MP4/WEBM, PDF, dan TXT dengan
  batas efektif maksimum 8 MiB, timeout, signature check, nama file aman, dan cleanup.

### Security
- Panel hanya dapat dibuat di `MOD_LOG_CHANNEL_ID` yang menutup View Channel untuk
  `@everyone`; tidak ada fallback publik atau berbasis nama.
- Intake juga gagal tertutup bila `OWNER_ID` belum diatur, role `@everyone` tidak pernah
  dianggap reviewer, dan bukti tidak boleh mengikuti redirect keluar Discord CDN.
- `REPORT_MODERATOR_ROLE_IDS` terpisah dari role Ops Hub. Semua tombol/modal mengecek
  ulang izin runtime; Reveal dan Purge tetap owner-only.
- Panel anonim tidak memuat ID pelapor, seluruh payload menonaktifkan mention parsing,
  dan audit tidak menyimpan isi laporan, link pesan, bukti, atau catatan moderator.
- Link pesan tidak hanya diperiksa bentuknya: Hengs mengambil pesan tersebut dari guild
  yang sama tanpa menyimpan isi pesan. Error internal dan path lokal tidak diteruskan
  kepada pelapor.
- Tidak ada hukuman otomatis, AI judgment, DM, notifikasi publik, atau integrasi Canox/WA.

### Fixed
- Claim memakai revision compare-and-set sehingga dua moderator tidak dapat sama-sama
  memiliki laporan yang sama.
- Restart menyinkronkan panel tertinggal; purge hanya menghapus state setelah pesan
  Discord berhasil dihapus atau sudah tidak ada, sedangkan kegagalan tetap retryable.
- Panel yang sempat terkirim sebelum proses crash tetapi belum masuk state ditemukan
  kembali lewat marker Report ID, sehingga retry/startup tidak mengirim panel ganda.
- Delivery claim atomik memastikan dua request paralel tidak dapat sama-sama mengirim
  panel. Respons kirim yang ambigu dipulihkan dengan pencarian marker sebelum retry.
- Kegagalan upload panel melepaskan reservation idempotent dan startup membuang
  reservation terputus yang tidak memiliki panel, sehingga tidak ada laporan aktif yatim.
- Resolve, Dismiss, dan Purge mengakui modal sebelum operasi state/jaringan; request
  paralel dari pelapor yang sama juga ditahan selama submission pertama berlangsung.
- Purge memakai revision compare-and-set sehingga modal lama tidak dapat menghapus
  laporan yang berubah ketika interaction sedang diakui.
- Cleanup file sementara diisolasi agar kegagalannya tidak membatalkan panel yang sudah
  tersimpan. State yang parseable tetapi tidak memenuhi schema lengkap kini gagal tertutup.

### Tests
- 112 test lulus, termasuk privacy channel, anonimitas, forged interaction,
  claim race, stale modal, evidence bounds/signature/cleanup, dan retention recovery.
### Operations
- Sepuluh guild slash command berhasil didaftarkan; schema remote `/report` terverifikasi
  memuat `category`, `details`, `member`, `message_link`, `evidence`, dan `anonymous`.
- `MOD_LOG_CHANNEL_ID` diarahkan ke channel `mod-logs` privat dengan reviewer owner-only,
  batas bukti 8 MiB, dan retention 30 hari.
- Live acceptance sintetis membuat panel anonim privat, memastikan identitas pelapor
  tersembunyi serta kontrol moderator tersedia, lalu menghapus kembali panel dan state uji.
- Bot restart sebagai satu instance `v1.11.0` dengan runtime health `connected`.
- Launcher lokal `restart.bat` dinormalkan ke ASCII/CRLF dan tidak lagi bergantung pada
  `timeout` interaktif, sehingga dapat dipakai dari shell hidden.

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

### Operations
- Sembilan guild slash command berhasil didaftarkan ulang; schema remote `/ops`
  terverifikasi memuat `draft`, `status`, `overview`, dan `history`.
- Bot restart sebagai satu instance `v1.10.0`, mencapai `CONNECTED`, memperbarui
  heartbeat dan uptime setelah satu interval penuh, serta menolak instance kedua.
- Read-only Discord server verification lulus dengan 0 failure dan 0 warning.

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
