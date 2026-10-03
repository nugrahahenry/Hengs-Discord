# Changelog — Discord Bot "Hengs"

Format: [Keep a Changelog](https://keepachangelog.com/id/1.1.0/) · Versi: [SemVer](https://semver.org/lang/id/).
Lihat aturan lengkap di `../../../../KONVENSI-VERSI.md`.

## [Unreleased]

## [1.39.0] - 2026-10-03

### Added

- Canox dapat mengirim kartu tugas proyek melalui inbox Ops Hub lokal.
- Discord mempertahankan `kind=project` sebagai label kartu privat tanpa publish otomatis.
- Payload announcement lama tetap kompatibel dan jenis draft dibatasi secara eksplisit.

## [1.38.0] - 2026-10-03

### Added

- Prompt `tugas proyek`, `rencana proyek`, dan `backlog proyek` membuat kartu tugas privat di Ops Hub.
- Kartu tugas memakai editor bounded, fallback lokal, dan approval yang sama dengan draft operasi.
- State draft lama tetap kompatibel karena `kind` hanya menerima `announcement` atau `project`.

## [1.37.0] - 2026-10-03

### Added

- `/hengs ask` kini mendukung catatan pribadi dan pengingat satu kali dengan bahasa natural.
- Catatan menunggu preview dan konfirmasi. Pengingat yang belum punya jam meminta follow-up, lalu
  dikirim satu kali melalui DM owner.

### Security

- Jalur personal hanya aktif untuk owner atau Administrator di home guild dan selalu ephemeral.
  Mention publik, member biasa, dan server publik tidak boleh menulis state pribadi.
- State dibatasi per guild dan user, ditulis atomik, tanpa provider AI baru, dan scheduler membatasi
  percobaan pengiriman serta memulihkan pengiriman yang tertahan.

### Verification

- Suite lokal penuh lulus 496/496. Acceptance release di VM lulus 493 test dengan 3 skip dan 0
  failure. Cloud sekarang v1.37.0 active/enabled dengan dua heartbeat `CONNECTED/OK/fresh`.
- Deploy tidak mengubah token, auth, state lama, VM, atau WA. Archive, checksum, deployer sementara,
  dan staging remote sudah dibersihkan setelah acceptance.

## [1.36.0] - 2026-10-02

### Added

- Prompt owner atau editor Ops Hub seperti `lihat status draft` kini menampilkan ringkasan bounded
  dari jumlah draft dan event aktif secara privat.

### Security

- Status operasi hanya membaca store yang sudah ada, tidak menampilkan isi draft, tidak membuat
  draft baru, dan tidak memiliki jalur publish atau scheduler baru.

### Verification

- Focused prompt operation, prompt assistant, dan command tests pass. Cloud tetap v1.35.0 sampai
  deployment berikutnya disetujui.

## [1.35.0] - 2026-10-02

### Added

- Prompt natural untuk pengumuman, update proyek, event, dan reminder kini masuk ke draft privat
  Ops Hub atau Event Hub yang sudah ada.
- Prompt event menerima waktu WIB eksplisit dalam format `HH:mm` atau `YYYY-MM-DD HH:mm`.

### Security

- Parser operation bersifat deterministik, bounded, dan hanya aktif di home guild untuk owner atau
  editor Ops Hub. Tidak ada scheduler, database, atau Discord write baru.
- Draft tetap menunggu review panel dan keputusan owner. Waktu relatif seperti "besok" tidak ditebak
  dan meminta klarifikasi.

### Verification

- Full local suite passes 487/487. Cloud tetap v1.28.0; belum ada deploy, restart, command
  registration, atau dogfooding live.

## [1.34.0] - 2026-10-02

### Added

- Community preview tickets now offer an optional private PNG card alongside the text tree.
- The card uses the existing Canvas runtime and marks fixed text and voice channels as already
  available or still suggested.

### Security

- The image is generated locally from the same allowlisted blueprint and inventory fingerprint.
  It contains no prompt, guild ID, channel ID, member data, or provider output.

### Verification

- Preview-card, prompt-review, apply, and cloud-release tests pass locally. Cloud remains v1.28.0;
  no deployment or live Discord mutation was performed.

## [1.33.0] - 2026-10-02

### Added

- Owner confirmation now has a separate apply step for community blueprints.
- The executor can create only missing fixed text and voice channels, with a bounded maximum of
  24 creates per ticket.

### Security

- Apply is home-owner-only, fingerprint-bound, permission-checked, create-only, and protected by
  a per-guild in-memory lock. It cannot rename, delete, move, create categories, change roles or
  permissions, send messages, or accept arbitrary channel names.
- Stale, partial, failed, or unavailable applies consume the ticket and never retry automatically.

### Verification

- Prompt, review, apply, and cloud-release tests pass locally. Cloud remains v1.28.0 and no live
  Discord mutation or deployment was performed.

## [1.32.0] - 2026-10-02

### Added

- Community planning prompts that lack enough detail now ask three bounded preference questions
  before producing a preview.
- Community previews now show a tree with separate text and voice channels, including existing
  versus suggested markers.

### Security

- The new flow remains provider-free and read-only. It stores no answers or prompts, performs no
  Discord mutation, and keeps the existing owner or Administrator gate and private review ticket.

### Verification

- Focused prompt and preview tests pass. Cloud remains v1.28.0 and no command registration,
  deployment, or live Discord change was performed.

## [1.31.0] - 2026-10-01

### Added
- Prompt fokus natural untuk owner atau Administrator: belajar, scrim, status, dan handback.
- Prompt fokus memakai state mode yang sama dengan `/study` dan `/scrim`, tanpa provider AI atau
  mutasi channel, role, permission, maupun pesan.

### Security
- Prompt fokus hanya aktif di home scope dengan pemeriksaan owner atau Administrator. Pertanyaan,
  negasi, jadwal, durasi, dan pilihan mode ganda tidak mengubah state.

### Verification
- Fokus prompt, permission, dan state action tests lulus. Cloud tetap v1.28.0; belum ada deploy,
  restart, registrasi command, atau mutasi Discord.

## [1.30.0] - 2026-09-30

### Added
- Preview privat berbasis tombol untuk prompt rancangan komunitas.
- Ticket RAM-only dengan TTL lima menit, fingerprint inventory, batas kapasitas, dan aksi satu kali.
- Review ulang, batalkan, dan konfirmasi owner yang tetap belum menerapkan perubahan server.

### Security
- Setiap komponen memeriksa ulang sumber pesan bot, guild, channel, scope home, requester, owner,
  expiry, dan perubahan inventory. Channel yang tidak terlihat bot tidak dihitung.
- Administrator dapat meminta preview tetapi tidak dapat mengonfirmasi. Tidak ada state persisten,
  prompt mentah, provider call, arbitrary Discord API action, atau fallback publik.

### Verification
- Cloud tetap v1.28.0. Belum ada deployment, restart, registrasi command, atau mutasi Discord.

## [1.29.0] - 2026-09-30

### Added
- Prompt-first Community Assistant untuk mention Hengs dan `/hengs ask`.
- Prompt bantuan dan prompt rancangan struktur komunitas memakai blueprint deterministik untuk
  lobi masuk, server core, area gaming, dan creator studio.
- Blueprint menandai channel yang sudah ada tanpa menyimpan state baru atau mengirim prompt ke
  provider AI.

### Security
- Rancangan struktur hanya tersedia di home guild untuk pemilik server atau Administrator.
- v1.29.0 tidak membuat, menghapus, atau mengubah channel, kategori, role, permission, atau pesan.
- Prompt biasa tetap mengikuti rate limit, history, dan policy provider yang sudah ada.

### Verification
- Fokus prompt assistant dan routing command lulus 19/19.
- Cloud tetap v1.28.0. Belum ada deployment, restart, registrasi command, atau mutasi Discord.

## [1.28.0] - 2026-08-25

### Added
- The private Control Center now opens one Settings panel with fixed reply-style and language
  selects, one chat-channel picker, one Community Pack channel picker, All Channels, Turn Off
  Community Pack, and Back actions.
- Every successful selection re-renders the current validated settings with one fixed confirmation
  notice. Existing slash commands remain available as equivalent controls.

### Changed
- The active dashboard replaces Select Channel Again with Settings. The legacy v1.27.0 Repair
  component remains safely accepted during its short interaction lifetime and opens Settings.
- Chat-channel health and selection require View Channel, Send Messages, and Read Message History.
  Attach Files remains a separate Community Pack requirement.
- v1.28.0 does not change slash-command schema, so the combined deployment still needs only the one
  `/setup dashboard` registration introduced by v1.27.0.

### Security
- Every select and button rechecks fresh public-guild scope plus owner or Administrator access.
- Style and language accept only existing enums. Channel pickers require exactly one current-guild
  text or announcement channel selected through Discord, never typed IDs or channel names.
- Each action invokes one existing atomic schema 4 setter. Invalid values, cardinality, channel
  type, ownership, or permissions leave configuration unchanged with no fallback or partial preset.
- Settings add no persistent field, component session, member data, content, secret, or AI call.

### Verification
- Focused Settings, routing, and release verification passes 56/56. The complete local suite passes
  456/456, production dependency audit reports 0 vulnerability, and runtime source contains no em
  dash or en dash.

### Operations
- Immutable v1.28.0 is live as the only Discord token consumer. Two advancing healthy heartbeats,
  one cloud Discord process, zero service restarts, zero local bot processes, and clean staging
  passed acceptance. Persistent state and the configured Anti-Raid mode were preserved.
- One valid command registration completed after runtime health acceptance. Read-only audit confirms
  two global commands, 12 home-guild commands, and the exact `/setup dashboard` schema.
- WhatsApp remained active/enabled as exactly one cloud process. Deployment did not restart WA,
  change WA auth, reboot the VM, start a local bot, or activate a public guild.
- Commit `21c5bdd` remains local because the existing GitHub CLI credential is invalid. Cloud
  deployment used its checksum-verified immutable archive; publication to `origin/main` is pending.

## [1.27.0] - 2026-08-25

### Added
- `/setup dashboard` opens one private Community Control Center for pending or active public guilds.
- Active panels show fixed setup status, language, style, channel scope, Community Pack state,
  seven-day usage, trend, and configuration health without exposing channel IDs or names.
- Exact buttons provide refresh, channel repair through the existing picker, private welcome-card
  preview, aggregate Owner Insights, and confirmed disable actions.

### Changed
- `/setup disable` now opens the same two-step confirmation used by the dashboard instead of
  deleting configuration immediately.
- The global `/setup` schema adds one `dashboard` subcommand. The combined v1.26.0 and v1.27.0
  deployment therefore requires one command registration after health acceptance.

### Security
- Every dashboard click rechecks the current guild scope and owner or Administrator permission.
- Components accept only exact allowlisted IDs. Refresh and cancel are read-only, Repair does not
  write before a valid channel selection, and Preview cannot publish or mention a member.
- Confirm Disable purges aggregate Owner Insights before removing the exact guild config. Purge
  failure preserves the config and returns only fixed privacy-safe copy.
- The dashboard adds no persistent state, session identifier, member data, chat content, or AI call.

### Verification
- Focused Control Center, routing, and release verification passes 50/50. The complete local suite
  passes 449/449, production dependency audit reports 0 vulnerability, and runtime source contains
  no em dash or en dash.

## [1.26.0] - 2026-08-25

### Added
- `/setup start` now opens a private Discord channel picker. One selection applies the fixed Hengs
  Standard preset with balanced replies, automatic language, current-channel scope, and Community
  Pack enabled in the same channel.
- Owner Insights compares the latest seven UTC days with the preceding seven days and reports a
  fixed new, up, down, or steady trend.
- Owner Insights checks configured chat and Community Pack channels at read time and reports fixed
  permission or availability issues without exposing channel IDs or names.

### Security
- Wizard completion rechecks owner or Administrator access, fresh guild scope, active-guild
  capacity, one-channel cardinality, current-guild ownership, channel type, and four required bot
  permissions before any write.
- Hengs Standard is a static public mapping. It never reads or copies home-guild settings, IDs,
  roles, channels, prompts, history, or member data.
- Preset activation uses one atomic schema 4 write. Trend and configuration-health fields are
  calculated from existing state and are not persisted.

### Changed
- Reopening `/setup start` is read-only until a channel is selected. Reapplying an exact preset is
  idempotent, while applying it after customization clearly replaces only the four public settings.
- Setup guidance no longer asks a friend to find Server ID or Channel ID.

### Verification
- Focused guided-setup, config-store, insights, routing, and release verification passes 55/55.
- The complete local suite passes 438/438. Deployment and Discord registration remain pending
  separate authorization.

## [1.25.0] - 2026-08-24

### Added
- `/setup welcome` lets a public server owner or Administrator preview the Aurora card privately,
  enable welcome and leave cards in the current channel, or disable them without manual IDs.
- Owner Insights now reports active days, average requests per active day, the busiest aggregate
  day, feedback coverage, helpful rate, and up to two deterministic recommendations.

### Security
- Community Pack is disabled by default for new and migrated guilds. It requires View Channel,
  Send Messages, and Attach Files, targets only the configured channel, and never falls back.
- New public invite links request Attach Files in addition to the existing minimal chat permissions
  so Community Pack can render its selected channel card.
- Public member events cannot run home-only auto-role, stats, moderation, or private welcome copy.
- Richer insights are calculated from the existing schema 1 aggregate buckets. No chat content,
  answer, member identity, channel identity, or new persistent field is collected.

### Changed
- Guild config schema 4 adds only the Community Pack enabled flag and selected channel ID. Schemas
  1 through 3 remain readable and migrate on an authorized write with Community Pack disabled.
- Public setup status now shows whether Community Pack is active.

### Operations
- Immutable v1.25.0 is live as the only Discord token consumer. Command registration ran exactly
  once after health acceptance. Read-only audit confirms two global commands, 12 home-guild
  commands, and the exact `/setup welcome` actions.
- Community Pack remains opt-in. Deployment did not enable it or mutate any public guild.

### Verification
- The complete suite passes 429/429 on local Node 24.15.0. Syntax checks pass for 111 JavaScript
  files and four Linux shell files, whitespace checks pass, runtime source contains no em dash or
  en dash, and the production dependency audit reports 0 vulnerabilities.
- Production acceptance passed two advancing `CONNECTED`/`OK`/fresh heartbeats with exactly one
  Discord process and zero service restarts. WhatsApp v0.20.3 remained healthy and unchanged,
  both local bots remained stopped, and release staging plus transfer residue were clean.

## [1.24.0] - 2026-08-23

### Added
- Welcome and leave cards now combine a reusable ImageGen aurora background with deterministic
  Canvas glass, avatar, identity, statistics, member-number, and border layers.
- The optimized production background is exactly 900 x 280, while the high-resolution source is
  retained separately for future crops and visual revisions.

### Fixed
- Short member tenure no longer displays `0d`. It now keeps useful minute and hour precision, such
  as `8m`, `2h 5m`, or `1d 2h`. Missing Discord join timestamps display `Unknown` instead of a
  fabricated duration.
- The visible welcome copy and all remaining runtime source now avoid em dash and en dash. A global
  regression test prevents either character from returning.

### Verification
- Focused visual, runtime-copy, and release tests pass 29/29. The full suite passes 421/421 on
  local Node 24.15.0. All 109 JavaScript files and four shell scripts pass syntax checks, the
  production dependency audit reports 0 vulnerabilities, and whitespace checks pass. Both PNG
  assets contain no textual or EXIF metadata. Exact Node 22 remains mandatory before deployment.
- No deployment, command registration, service restart, Discord write, or cloud mutation occurred.

## [1.23.0] - 2026-08-23

### Added
- `/setup insights` gives a public server owner or Administrator a private 7-day or 30-day
  summary of accepted requests, temporary limits, daily limits, and response feedback.
- Public AI answers now include requester-only `Membantu` and `Kurang pas` buttons. Each answer
  accepts one feedback choice and removes its buttons after the choice is recorded.
- A persistent per-guild daily request budget defaults to 100 accepted requests per UTC day. An
  operator may set a value from 10 to 300 with `HENGS_PUBLIC_DAILY_REQUEST_LIMIT`.

### Security
- Owner Insights stores daily integer aggregates and random request IDs only. It does not persist
  prompts, answers, usernames, display names, channel data, or per-member metrics.
- State uses strict schema validation, tenant-bound paths, symlink rejection, atomic writes,
  31-day retention, and fixed-code errors. A failed budget write blocks the provider call.
- `/setup disable` removes Owner Insights before removing the guild config and fails closed if the
  privacy purge cannot finish.

### Verification
- Focused Owner Insights and routing tests pass 48/48. The full suite passes 417/417 on local Node
  24.15.0, all 109 JavaScript files and four shell scripts pass syntax validation, the production
  dependency audit reports 0 vulnerabilities, and whitespace plus tracked-content checks pass.
  Exact Node 22 acceptance remains mandatory before deployment.
- No deployment, command registration, invite installation, service restart, Discord write, or
  cloud mutation occurred in this checkpoint.

## [1.22.0] - 2026-08-23

### Added
- `/hengs invite` gives any member a private self-service link for adding Hengs to another server
  they manage. It reuses the existing fixed Discord OAuth contract and minimum permissions.
- `/hengs privacy` explains AI-provider processing, in-process memory of at most 10 recent
  messages per user and server, caller-only reset, non-persistent chat history, and removable
  server configuration.

### Changed
- `/hengs help` now gives separate first-use guidance for members and server managers, including
  direct routes to setup, privacy, and invitation.
- The one-time public welcome includes the privacy command before the server is activated.

### Security
- Invite and privacy responses are private, mention-safe, and available without reading guild
  configuration or calling an AI provider. The invitation accepts only a validated application
  ID and always uses Discord's fixed domain, scopes, and existing minimum permission set.
- Invalid invite configuration produces one fixed error code without exposing identifiers or raw
  configuration. Unexpected failures from either public command also use one fixed outer error
  code. The generated URL never contains the bot token.

### Verification
- Focused command, onboarding, invite, and release tests pass 24/24. The full suite passes 397/397
  on local Node 24.15.0, all 105 JavaScript files and four shell scripts pass syntax validation,
  the production dependency audit reports 0 vulnerabilities, and whitespace plus release-content
  checks pass. Exact Node 22 acceptance remains mandatory before deployment.
- No deployment, command registration, invite installation, service restart, Discord write, or
  cloud mutation occurred in this checkpoint.

## [1.21.0] - 2026-08-23

### Added
- `/hengs ask`, `/hengs reset`, and `/hengs help` provide one simple public AI command, a
  caller-only memory reset, and fixed onboarding guidance.
- `/setup language` offers Auto, Indonesian, and English presets. `/setup channel` lets an owner or
  Administrator allow every channel or select the current channel without entering an ID.
- `/setup status` now summarizes reply style, language, and channel scope without exposing stored
  Discord IDs.

### Changed
- Public guild config schema 3 stores fixed language and channel settings. Schemas 1 and 2 remain
  readable and migrate atomically only on an authorized write.
- Public mention chat and `/hengs ask` share the same per-guild concurrency and rolling-window
  traffic guard. Both honor the selected channel and static language instruction.
- Command registration plans exactly two global commands, `/setup` and `/hengs`, while every legacy
  command remains scoped to the home guild.

### Security
- AI prompts are bounded user data, every AI response disables mentions, and custom language,
  custom system prompts, arbitrary channel IDs, cross-user reset targets, and cross-guild history
  are not accepted.
- Channel checks happen before traffic admission. Invalid config, IDs, permissions, and settings
  fail closed without entering provider or legacy home-only paths.

### Verification
- The focused public server suites pass 43/43 and the full suite passes 393/393 on local Node
  24.15.0. All 105 JavaScript files and four shell scripts pass syntax validation.
- The production dependency audit reports 0 vulnerabilities. Whitespace, release-content policy,
  fixed-code failures, owner or Administrator authorization, caller-only reset, mention safety,
  prompt bounds, channel isolation, and cross-guild state boundaries pass targeted review. Exact
  Node 22 acceptance remains a mandatory deployment gate.
- No deployment, command registration, service restart, Discord write, or cloud mutation occurred
  in this checkpoint.

## [1.20.0] - 2026-08-23

### Added
- New public guilds receive one fixed, mention-safe setup guide in an existing writable channel.
  Hengs never creates a channel, retries delivery, or activates the guild automatically.
- `/setup style` lets the guild owner or an Administrator select Balanced, Concise, or Technical
  replies through fixed choices.

### Changed
- Public guild config schema 2 stores only the fixed reply-style enum. Schema 1 remains readable
  and migrates atomically on the next authorized activation or style change.
- Public AI prompts now append one static style instruction while retaining guild-separated
  history and the neutral Hengs identity.

### Security
- Onboarding runs only for pending public guilds, verifies View Channel and Send Messages on the
  selected existing channel, disables mentions, logs fixed codes, and never persists delivery data.
- Reply style rejects free-form input, cross-guild state, and unauthorized members. Legacy command,
  component, moderation, member, reaction, and voice paths remain home-only.

### Verification
- The focused public, setup, config-store, and release suites pass 43/43. The full suite passes
  380/380 on local Node 24.15.0, and all 100 JavaScript files pass syntax validation.
- The production dependency audit reports 0 vulnerabilities. Targeted security review confirms
  fixed-enum prompt selection, owner or Administrator authorization, mention-safe onboarding,
  atomic config writes, cross-guild isolation, and privacy-safe failure logs.
- `git diff --check` and the tracked release-content policy pass. Exact Node 22 acceptance remains
  a mandatory deployment gate. No deployment, command registration, restart, invite installation,
  or public guild activation occurred in this checkpoint.

## [1.19.1] - 2026-08-21

### Fixed
- AI provider initialization now permits secretless immutable release acceptance. Groq and
  OpenRouter clients are created only when their dedicated keys exist, while production still
  receives the same keys from its root-controlled environment.
- Cloud deployment and release metadata now target v1.19.1 after v1.19.0 was rejected safely
  during pre-activation Ubuntu acceptance.

### Verification
- A focused child-process test reproduces the Ubuntu failure with all AI keys removed and now
  proves that `src/agent.js` loads without reading a local `.env`.
- Exact Node 22.23.2 full tests pass 372/372, all 99 JavaScript files pass syntax checks,
  `git diff --check` passes, and the production dependency audit reports 0 vulnerabilities.
- The v1.19.0 deployment attempt never switched the production symlink. Rollback acceptance found
  v1.18.0 active, enabled, connected, fresh, single-process, with WhatsApp cloud still active and no
  failed release directory.
- Immutable v1.19.1 deployment passed Ubuntu acceptance and two fresh connected heartbeats more
  than 30 seconds apart. Discord is active/enabled as one process, persistent state is available,
  WhatsApp stayed active, and v1.18.0 remains available for rollback.
- Command registration ran exactly once: one global `/setup`, 12 home commands, and no home-scoped
  `/setup`. Public installation is allowed, OAuth code grant is not required, and a least-privilege
  invite URL was generated.
- No friend guild activation, config mutation, state restore, VM reboot, WhatsApp restart, local
  bot start, or Anti-Raid mode change occurred.

## [1.19.0] - 2026-08-21

### Added
- Public Self-Service Beta menyediakan `/setup start`, `/setup status`, dan `/setup disable` tanpa
  meminta pengguna mencari atau mengirim Server ID.
- Konfigurasi server disimpan atomik pada namespace terpisah dan invite generator meminta izin
  Discord minimum tanpa membaca token.
- Traffic guard membatasi satu jawaban AI aktif dan 30 permintaan per 10 menit untuk setiap server
  publik.

### Changed
- Hanya `/setup` yang direncanakan sebagai global command. Dua belas command lama tetap terikat
  pada server utama Henry.
- History dan cooldown AI memakai key gabungan server dan user. Server publik memakai prompt Hengs
  netral tanpa profil pribadi Henry.
- Kapasitas default adalah 25 server aktif dan dapat diatur secara ketat dari 1 sampai 100.

### Security
- Semua handler lama, komponen, member event, reaction role, voice restore, dan moderasi gagal
  tertutup di luar server utama.
- Setup membutuhkan owner server atau Administrator, konfigurasi menolak path symlink dan schema
  asing, serta respons setup selalu privat dan bebas mention.
- Konfigurasi server dihapus saat `/setup disable`; konfigurasi yang rusak dan kapasitas penuh gagal
  tertutup tanpa membuka fitur privat.

### Verification
- Public Beta focused tests pass 28/28 and the complete suite passes 371/371 on exact Node
  22.23.2. All 99 JavaScript files pass syntax checks, `git diff --check` passes, and the
  production dependency audit reports 0 vulnerabilities.
- Targeted security review removed friend server names and IDs from startup logs, removed the
  unused setup channel ID from persistent config, disables mentions in AI replies, uses fixed public
  error logging, and found no credential material in changed files.
- Belum ada deployment, restart, registrasi command produksi, pembuatan invite nyata, atau
  perubahan server Discord pada checkpoint lokal ini.

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
