# Hengs Discord Bot - Handoff

Updated: 2026-08-21

## Current local checkpoint: v1.19.1 - Public Self-Service Beta Deployment Fix

- v1.19.0 commit `6e60c55` is on `main` and `origin/main`. Local build and transfer succeeded.
  The first deployment invocation used the v1.18.0 deployer and was rejected by its version gate.
  The second used the hash-verified v1.19.0 deployer, installed dependencies, then reproduced a
  secretless test failure because `src/agent.js` created OpenRouter without a key. Both attempts
  stopped before switching `current`; fallback restored v1.18.0 active/enabled, connected/fresh,
  single-process, WhatsApp remained active, and no failed release directory remained.
- v1.19.1 fixes the blocker by constructing each AI client only when its dedicated key exists.
  A child-process regression runs from a directory without `.env` and removes all AI keys.
  Package, lockfile, release builder, Linux deployer, tests, README, and runbook now target v1.19.1.
  Exact Node 22.23.2 full tests pass 372/372, all 99 JavaScript files pass syntax checks,
  `git diff --check` passes, and the production dependency audit reports 0 vulnerabilities.
  This patch still needs Henry to review, commit, and push before another immutable build.
- `/setup` has not been registered globally and no public invite has been created. Do not register
  it while production remains v1.18.0.

- Public Beta memakai model lobi mandiri: server utama mempertahankan semua fitur v1.18.0,
  sedangkan server lain cukup memakai satu invite publik dan `/setup start`. Discord memberikan
  guild ID otomatis, jadi tidak ada Developer Mode, penyalinan Server ID, atau allowlist manual.
- Config per server memakai schema ketat dan write atomik di `data/guilds/<guildId>/config.json`.
  Guild ID divalidasi sebelum menjadi path, symlink ditolak, chat tidak dipersistenkan, dan
  `/setup disable` menghapus konfigurasi server secara idempotent.
- Runtime mengklasifikasikan semua event sebagai home, public aktif, pending, denied, atau DM sebelum
  handler fitur. Semua command dan komponen lama, moderasi, member event, reaction role, stats, dan
  voice tetap home-only.
- History AI sekarang memakai `<guildId>:<userId>`. Prompt publik selalu mengaku sebagai bot Hengs
  dan tidak memuat profil, jadwal, atau identitas pribadi Henry.
- Kapasitas default 25 server aktif, rentang konfigurasi 1 sampai 100. Setiap server publik dibatasi
  satu permintaan AI aktif serta 30 permintaan yang dimulai per 10 menit.
- Registrasi command dipisah: hanya `/setup` global dan command lama tetap guild-scoped. Import
  modul deploy tidak lagi memiliki side effect. Invite generator meminta izin minimum dan tidak
  membaca token.
- During the first red test, importing the legacy deploy module started its old asynchronous
  home-guild registration path before the missing new modules terminated the test process. No
  success response was observed. Final read-only Discord audit still shows exactly 12 home commands
  and no `/setup` in either global or home scope, so external command state is materially unchanged.
  The new main guard prevents imports from making any request.
- Architecture gate internal berada di `docs/architecture/DISCORD_PUBLIC_BETA_V119.md`.
- Public Beta focused tests pass 28/28 and the full suite passes 371/371 on exact Node 22.23.2.
  All 99 JavaScript files pass syntax checks, `git diff --check` passes, and the production
  dependency audit reports 0 vulnerabilities. Security review confirms setup authorization,
  capacity and concurrency backpressure, mention-safe AI replies, fixed public error logs, strict
  config deletion, no credential material, and home-only legacy paths.
- Cloud masih menjalankan v1.18.0. Jangan deploy, menjalankan `npm run deploy`, membuat invite nyata,
  atau restart service sebelum Henry memberi izin eksplisit baru.

## Production baseline: v1.18.0 - Oracle E2 Micro production cutover

- Added fixed-shape `VM.Standard.E2.1.Micro` acquisition support without A1-only flexible sizing,
  plus a fail-closed region/shape state-mismatch gate and isolated E2 example configuration.
- Henry authorized exactly one E2 attempt. It succeeded once, and read-only verification confirms
  exactly one `RUNNING` E2 Micro instance; the A1 state remains `STOPPED` with all three attempts.
- Ubuntu host bootstrap completed with Node 22, UFW, Tailscale, the service identity, persistent
  directories, and a verified systemd unit. Laptop and VM Tailscale enrollment plus private SSH
  acceptance completed on 2026-08-14; public SSH remains available for recovery.
- Package, release-builder, test fixture, README, and deployment runbook versions are aligned to
  `1.18.0`. The release content scanner now keeps credential assignments line-bounded, and an
  integration gate verifies every tracked file so credential-shaped test sentinels cannot block
  packaging again. Focused release/OCI/overview tests pass 29/29; full `npm test` passes 343/343;
  JavaScript syntax checks, `git diff --check`, and the production dependency audit pass.
- Pre-deployment review caught the Linux deployer still pinned to v1.15.0 before any release
  transfer. Its archive-name, release-ID, and package-version gates are now aligned to v1.18.0;
  focused Linux safety tests pass 13/13, and the service-start prohibition is unchanged.
- The first Ubuntu dependency-install rehearsal stopped before release activation because the
  non-login service identity has no writable home for npm cache. Post-failure audit confirmed the
  service disabled/inactive, empty env, no release/current pointer, and zero production state
  files. The deployer now supplies a per-run temporary npm home/cache and deletes it on exit;
  focused Linux tests pass 14/14 and `bash -n` passes on the target Ubuntu host.
- A subsequent Ubuntu run reached the full suite and exposed three archive-only assumptions before
  activation: shell export line endings, repository-only Git metadata, and the local Hengs workspace
  path. Shell files are now exported as LF via `.gitattributes`; repository-only gates skip when
  `.git` is intentionally absent; and the WA bridge keeps a portable explicit-path test while its
  local-layout assertion remains workspace-only. Post-failure audit again confirmed no active
  service, release pointer, secret, or production state.
- The first `READY` release audit found its root directory was `root:root` mode 0750, so the
  non-login service user could not traverse it. The service was still disabled/inactive with an
  empty env and zero production state files. Immutable release files/directories now remain
  root-owned but use the dedicated `hengs-discord` group, preserving read/traverse access while
  removing group/world write permission; focused Linux safety tests pass 14/14.
- Immutable release `1.18.0-47849dbfe82c` is installed and selected by `current`. Ubuntu archive
  acceptance passes 340 tests with 0 failures and 3 intentional repository/workspace-only skips;
  production dependency audit reports 0 vulnerabilities. Final split acceptance confirms the
  service user can read the release, files/directories are root-owned and service-group-readable,
  group/world writes are absent, the persistent data link is correct, and the previous unstarted
  release remains available for rollback.
- The v1.18.0 code checkpoint is committed as `91c66ee` on `main` and `origin/main`. On 2026-08-14,
  Henry explicitly approved a Discord token reset and secret installation without cloud start or
  cutover. The old token was reset in the Developer Portal, local `.env` was updated atomically,
  and the cloud environment was transferred over Tailscale, installed as
  `root:hengs-discord` mode 0640, checksum-verified, and stripped of its temporary transfer file.
- Henry then explicitly approved final production-state transfer and a single-consumer cutover.
  The local Discord process was stopped first while the separate WhatsApp process remained running.
  A final four-file filtered snapshot passed local and remote hash/manifest checks, restored
  atomically with service ownership/modes, and left no transfer artifact. Cloud autostart and the
  service were enabled only after both sides proved zero Discord consumers.
- Cloud v1.18.0 is now the sole authoritative Discord token consumer. Initial start, an explicit
  service restart, and one explicitly approved VM reboot each passed two fresh `CONNECTED`/`OK`
  heartbeats at least 30 seconds apart. Tailscale/SSH recovered after reboot, systemd autostart
  returned exactly one cloud Node process, local Discord remained at zero, WhatsApp remained at
  one, Anti-Raid stayed `monitor`, boot journal errors were zero, and read-only server verification
  reported 0 failures and 0 warnings. Temporary local and remote cutover snapshots were removed.
- The first encrypted off-VM backup acceptance passed on 2026-08-14. Four filtered persistent-state
  files were snapshotted and verified while cloud remained healthy, then the archive and manifest
  were encrypted with `age` before leaving the VM. Only the two ciphertext files are stored under
  ignored local `.cloud/backups/`; the recovery identity is separate in the protected local SSH
  directory and its public recipient is ignored under `.cloud/backup-keys/`. A full laptop-to-VM
  round trip decrypted, verified, and restored into an isolated rehearsal target with correct
  service ownership/modes. All remote plaintext, key, encrypted-transfer, and rehearsal artifacts
  were removed afterward; cloud remained `CONNECTED`/`OK`, local Discord stayed at zero, and
  WhatsApp stayed at one.
- A local Codex heartbeat automation named `Hengs daily encrypted backup` is active at 09:00 WIB.
  Its ignored runner lives under `.cloud/automation/`, fails closed on unhealthy cloud, a missing
  peer, or any local Discord consumer, sends only the public `age` recipient to the VM, and retains
  the seven newest ignored ciphertext backup directories. The private recovery identity never
  moves during routine backup. A manual acceptance of the exact runner produced the second valid
  backup, removed no retained version, left zero remote plaintext/temp artifacts, and preserved
  `CONNECTED`/`OK`. The next two daily runs double as the initial 24-48 hour observation window.
  This heartbeat is task/account-scoped and must be recreated if Hengs moves to another Codex
  account or task.

## Previous checkpoint: v1.17.2 - single-request OCI launch diagnostics

- Released as **v1.17.2** in `4a71721` on `main` and `origin/main`.
- Mutating `LaunchInstance` calls now pass `--no-retry`; retryable capacity handling remains
  controlled only by the persisted acquisition policy.
- Unmapped structured provider failures become non-retryable `PROVIDER_UNAVAILABLE` for 5xx
  or `PROVIDER_ERROR` for other statuses instead of another ambiguous `UNKNOWN`.
- Raw stdout, stderr, exception messages, provider codes, and request metadata remain discarded.
  Legacy `UNKNOWN` state remains readable for backward compatibility.

## v1.17.2 verification status

- TDD RED produced four expected failures for the missing provider buckets, state allowlist, and
  `--no-retry`; focused OCI diagnostics then passed 27/27.
- Full `npm test`: 334 passed, 0 failed.
- All 87 JavaScript files passed syntax checks; `git diff --check` passed and the production
  dependency audit found 0 vulnerabilities.
- Read-only Oracle Audit evidence for the second authorized attempt showed three
  `LaunchInstance.begin` events from the old OCI CLI retry behavior. No completion event was
  established, and a fresh read-only instance list found zero `hengs-discord` instances.
- The third explicitly authorized attempt ran after the maximum 105-minute interval on committed
  v1.17.2. Its final preflight returned `SUCCESS`, state reset changed only `STOPPED` to `PENDING`,
  and exactly one `attempt` invocation returned non-retryable `PROVIDER_UNAVAILABLE`.
- The post-attempt read-only instance list found zero `hengs-discord` instances. Acquisition is
  `STOPPED` with three historical attempts, no lock or process, and no fourth attempt. No secret,
  deploy, service start, or cutover action occurred.
- Both Hengs processes remain local. The approved local restart replaced the previous Discord
  process with exactly one v1.17.2 process while the separate WhatsApp process stayed running.
  Runtime health reports `CONNECTED`, advancing heartbeats, and no last issue. The command schema
  remains unchanged.
- Live owner acceptance passed in the existing private `bot-settings` channel: `/reports` showed
  the humanized empty queue, and **Lihat Contoh** rendered the fixed owner-only ephemeral preview.
  The report queue remained at zero, `reports-state.json` was not modified, no moderation state
  file was created, and Anti-Raid remained configured as `monitor`.
- The live interaction also emitted a non-blocking discord.js deprecation warning for the
  `ephemeral` response option. Privacy and behavior were correct; migrate applicable responses to
  `MessageFlags.Ephemeral` in a later compatibility patch before the next discord.js upgrade.
- The Windows sandbox ACL blocker was unrelated to project skills: a 22-byte NUL-filled
  `deny_read_acl_state.json` was quarantined, Codex regenerated valid state, and normal sandbox
  plus `apply_patch` verification passed.

## Current operational state and next point

Hosting research was refreshed on 2026-08-13 in
`docs/research/2026-08-13-hengs-hosting-24-7.md`. No resource, billing account, deployment,
secret transfer, or cutover was created during the research.

1. Henry set a hard USD 0 recurring-cost constraint. DigitalOcean, Google Cloud with paid IPv4,
   Railway, and other paid hosts are not eligible.
2. The zero-cost E2 preparation checkpoint is complete locally. The acquisition client treats
   `VM.Standard.E2.1.Micro` as a fixed AMD/x86 shape, omits A1-only `shape-config`, filters the
   selected image during shape preflight, and rejects region/shape state mismatches before any
   provider call.
3. A current Canonical Ubuntu 24.04 x86 image was `AVAILABLE`, and the live read-only E2 preflight
   returned `SUCCESS` for identity, region, one availability domain, image/shape compatibility,
   and subnet. E2 config/state is isolated under ignored `.cloud/e2/`.
4. On 2026-08-14 Henry explicitly authorized exactly one E2 Micro attempt. Final preflight returned
   `SUCCESS`; the single `attempt` invocation returned `SUCCESS`; post-launch read-only status is
   `SUCCEEDED` with exactly one attempt. Instance verification found exactly one active instance,
   `RUNNING`, with shape `VM.Standard.E2.1.Micro`. No second attempt or `run` invocation occurred.
5. Keep A1 acquisition `STOPPED` and preserve all three historical A1 attempts. E2 is the active
   production host. Capacity and idle reclamation remain provider risks; do not create artificial
   idle-avoidance traffic.
6. E2 host bootstrap completed on 2026-08-14. Read-only resource acceptance confirmed one
   `RUNNING` E2 Micro instance, one 47 GB boot volume, a public IPv4, and reachable SSH.
   First-login acceptance confirmed Ubuntu 24.04 x86_64, completed cloud-init, and passwordless
   sudo for the default Ubuntu operator.
7. Five Linux bootstrap assets were transferred to a new staging directory and matched SHA-256
   5/5 before execution. `install-host.sh` returned `HOST_INSTALL_READY`. Acceptance confirmed
   Node 22.23.2, npm 10.9.8, Tailscale 1.102.2 with `tailscaled` active, UFW active with OpenSSH
   allowed, and the installed systemd unit matching the reviewed repository asset.
8. `/etc/hengs/discord.env` is populated, checksum-verified, mode 0640, and owned by root plus the
   service group. Persistent state is mode 0750 under the service identity; release
   `1.18.0-47849dbfe82c` is production `current`. Tailscale 1.102.2 is installed on the laptop;
   both laptop and VM are online in the same tailnet, encrypted peer reachability and private SSH
   pass, and reboot recovery is accepted. Cloud systemd is active/enabled with exactly one v1.18.0
   process; local Discord is stopped and remains the rollback consumer only.
9. Azure for Students is no longer the active path while the E2 VM remains healthy. It stays a
   fail-closed temporary fallback only: Microsoft currently offers USD 100
   credit for up to 12 months without a card and disables resources at depletion unless the user
   deliberately upgrades. It is not permanent hosting.
10. If Oracle reclaims E2 and student credit is unavailable, continue local-only. No verified
   cloud platform guarantees a persistent non-sleeping Discord worker forever at zero cost.
11. Keep cloud v1.18.0 as the sole authoritative Discord token consumer and keep local Discord
   stopped. Encrypted off-VM backup now runs daily at 09:00 WIB with seven-version retention; its
   first two scheduled runs are also the initial 24-48 hour health observation. Next checkpoints
   are (a) review those scheduled outcomes, (b) continue E2/systemd monitoring, and (c) collect
   Anti-Raid `monitor` evidence before any enforcement change. Command
   registration is unnecessary.
12. The tracked E2 acquisition support is released as v1.18.0. The seven Tailscale/deployment-
   hardening follow-up commits are present on both `main` and `origin/main`; only the cutover
   documentation updates in this working tree remain uncommitted.

Checkpoint commit: `Hengs Discord v1.18.0: Add Oracle E2 Micro acquisition support`

## Previous checkpoint: v1.17.1 - safe OCI diagnostics

- Committed as `4630d79` on `main` and `origin/main`.
- OCI failures distinguish `TIMEOUT`, `CLI_ERROR_UNSTRUCTURED`, and `CLI_OUTPUT_INVALID` while
  discarding raw stdout, stderr, and exception messages.
- Full `npm test`: 333 passed, 0 failed; focused OCI diagnostics: 26 passed, 0 failed.
- The first authorized launch remained a legacy `UNKNOWN`; no VM was found.

## Previous checkpoint: v1.17.0 - Report Center humanization

- Committed as `7269462` on `main` and `origin/main`.
- `/reports` keeps its guild-only private queue, adds clearer empty/active copy, and shows
  **Lihat Contoh** only to `OWNER_ID` while the queue is empty.
- Preview data is fixed, ephemeral, mention-safe, store-free, and has no moderator controls or
  report/mod-log side effects. Slash command schema did not change.
- Full `npm test`: 330 passed, 0 failed. Focused Report Center: 14 passed, 0 failed.
- Local Discord runtime remains v1.16.0 until Henry approves a restart and live UI acceptance.


## Previous checkpoint: v1.16.0 - Moderation Center UX and safety

- Proposed release: **v1.16.0**.
- `/mod preview` gives the Owner a fixed, ephemeral incident example without persistence,
  mod-log delivery, statistics, detection, deletion, or ban side effects.
- Activating enforcement requires a second Owner confirmation bound to the current state
  revision. Confirm, cancel, Monitor, and Off controls recheck authorization and stale state.
- Confirmed Active changes reassess effective readiness before claiming enforcement is live.
  Unsafe prerequisites keep effective Monitor, while configured Off remains effectively Off.
- Status, empty incidents, real incident cards, and allowlist feedback use consequence-first,
  human Indonesian copy. Monitor cards distinguish "not attempted" from failed enforcement.
- Allowlist output is limited to ten validated values and split within Discord's field budget.
- Mode-store failures receive sanitized, mention-safe guidance instead of an unanswered button.
- No moderation store schema migration was introduced.
- The guild command schema is registered and the local runtime now runs v1.16.0 as exactly
  one connected process. Anti-Raid remained Monitor revision 0 through restart. No deployment
  or live Active-mode testing was performed.

## v1.16.0 verification status

- Full `npm test`: 326 passed, 0 failed. Focused Moderation Center suite: 108 passed,
  0 failed. All 87 JavaScript files passed syntax checks.
- Production dependency audit found 0 vulnerabilities. The official release credential
  scanner accepted all 14 changed tracked files, and `git diff --check` passed.
- Local verification ran under Node 24.15.0 because Node 22 is not installed in this
  workspace. Production remains pinned to Node >=22 <23, so the engine warning is expected.
- Impeccable UI detector returned no findings. Targeted code and security re-review reported
  no remaining Critical or Important findings.
- Discord API confirms 12 guild commands and `/mod` exposes `status`, `incidents`, `preview`,
  and `allow`. Read-only server verification passed with 0 failures and 0 warnings.
- Restart replaced the v1.15.1 process with exactly one connected v1.16.0 process; its heartbeat
  advanced normally and Anti-Raid remained Monitor revision 0.
- No deployment, VM action, token transfer, public message, allowlist mutation, or live ban occurred.

## v1.16.0 next point

1. Henry can optionally open `/mod status`, `/mod incidents`, and `/mod preview` to inspect
   the final ephemeral UI from the Owner account.
2. Keep Anti-Raid in Monitor and review real incidents before considering enforcement.
3. Henry reviews and commits the local v1.16.0 checkpoint. Active ban acceptance requires a
   separately approved disposable dummy account.

Suggested commit: `Hengs Discord v1.16.0: Improve Moderation Center UX`

## Previous checkpoint: v1.15.1 - root-tenancy OCI preflight compatibility

- Proposed release: **v1.15.1**.
- Base deployment checkpoint `v1.15.0` is committed as `09c2eff`.
- OCI config now accepts either a regular compartment or the root tenancy as the
  provider-supported launch target.
- Local OCI identity, home region, availability domain, public subnet with internet
  and SSH, Ubuntu 24.04 ARM image, and A1 Flex visibility passed read-only validation.
- A dedicated OCI CA bundle is configured without disabling TLS verification.
- Oracle-first acquisition is bounded to eight capacity attempts per day, at least 90 minutes plus jitter apart, and seven days total. Only trusted structured host-capacity failures retry.
- Release archives are built only from committed `HEAD`; secrets, runtime state, internal docs, identifiers, keys, and dirty tracked changes are rejected.
- Linux uses Node 22, dedicated user `hengs-discord`, immutable releases, persistent state, root-owned secret, single-instance lock, systemd hardening, health inspection, and fail-stopped rollback.
- State transfer validates JSON, paths, archive types, duplicate entries, size, and SHA-256 before atomic restore. Off-VM backup has no plaintext fallback when `age` is unavailable.
- Local Windows defaults remain unchanged. Cloud disables the local WhatsApp recovery-alert bridge until the separate Tailscale bridge checkpoint.
- Anti-Raid remains `monitor`; slash command schema is unchanged.

## v1.15.1 verification status

- Focused OCI config regression: 10/10 passed after reproducing the root-tenancy failure.
- Live read-only OCI preflight returned `SUCCESS`; acquisition status remains
  `NOT_STARTED` with zero attempts.
- Full `npm test`: 309/309 passed; all 234 JavaScript files passed syntax checks;
  production dependency audit found 0 vulnerabilities; `git diff --check` passed.
- Focused cloud tests and all JavaScript syntax checks pass; all four Linux scripts pass `bash -n` through Git Bash.
- ShellCheck, `systemd-analyze verify`, real systemd sandbox compatibility, and Linux UID/GID acceptance remain pending on Ubuntu.
- Security review fixes and regression tests closed restore ownership/modes, pre-cutover enablement, production-state exposure during dependency scripts, and credential scanner coverage.
- No VM was created, no service was started, no token was transferred, and no production cutover occurred.

## v1.15.1 next point

1. Henry reviews and commits the verified patch checkpoint.
2. Obtain fresh approval before any VM creation attempt.
3. After capacity succeeds, run Ubuntu syntax/install acceptance while local Discord remains authoritative.

Suggested commit: `Hengs Discord v1.15.1: Support root-tenancy OCI preflight`

## Previous checkpoint: v1.14.0 - private WhatsApp recovery alerts

- Current release: **v1.14.0**.
- Committed as `11103b6`.
- Hengs Discord consumes the local WhatsApp lifecycle queue after Discord reaches Ready.
- Delivery is owner DM first, then the exact private `BOT_SETTINGS_CHANNEL_ID` in `DISCORD_GUILD_ID`.
- Missing or wrong-guild fallback configuration fails closed; no channel-name search or public fallback exists.
- The reducer suppresses healthy startup, collapses incidents resolved while Discord was offline, prevents duplicate QR/auth alerts, and sends recovery only after a problem was delivered.
- Restart-only notices have a 30-minute cooldown and never override QR/auth states.
- State writes are atomic, handled IDs and retry metadata are bounded to 500, retry backoff is 30 seconds to 5 minutes, and malformed events are quarantined with fixed-code logs.
- Oversized event files are rejected before their payload is read into memory.
- QR images, chat content, identifiers, tokens, paths, and raw errors never enter Discord payloads.
- No slash-command schema changed, so command registration is not required.

## Implementation

- `src/runtime/wa-recovery-alerts.js`: contract validator, reducer, delivery boundary, persistent state, retry, recovery, and poller.
- `src/index.js`: one lifecycle-managed consumer instance.
- `test/wa-recovery-alerts.test.js`: contract, reducer, path, and lifecycle wiring tests.
- `test/wa-recovery-consumer.test.js`: filesystem, delivery, fallback, retry, recovery, retention, and oversized-event tests.
- Shared default directory: `HenryLabs/Hengs/.runtime/wa-recovery-alerts`.

## Verification

- Recovery tests: 16/16 passed.
- Full `npm test`: 245/245 passed.
- All 66 JavaScript source/test files passed `node --check`; `npm audit --omit=dev` found 0 vulnerabilities; `git diff --check` passed.
- Live acceptance passed: restart and recovered events reached the owner DM, reducer state returned to `HEALTHY`, no public fallback was used, and the synthetic queue was cleaned.

## Next point

1. Keep Anti-Raid in `monitor` for 1-2 days and inspect `/mod incidents` for false positives.
2. Activate enforcement only after monitor evidence is acceptable.
3. Treat v1.14.0 as the stable Discord baseline for the next explicitly scoped feature.


## Previous checkpoint: v1.13.0 - code and safe live acceptance complete

- Scope: deterministic Anti-Raid dengan `/mod`, bounded tracked-deletion fallback,
  private mod-log, state/recovery, allowlist, dan dokumentasi operator.
- Pesan yang sudah match selalu berhenti di moderasi walau persistence/enforcement gagal;
  kegagalan hanya menulis fixed code dan tidak pernah jatuh ke AI chat.
- URL dengan credential atau port non-default tetap menyumbang sinyal perilaku dan tetap
  cocok dengan blocked host, tetapi tidak memperoleh kepercayaan allowlist.
- State memakai `schemaVersion: 1` dengan migrasi legacy, atomic write, dan kapasitas 500.
  Hanya insiden final dengan panel persisten yang dapat dievakuasi.
- Startup memulihkan status `detected` dan `enforcing`; panel yang belum tersimpan dicoba
  ulang secara idempotent melalui maintenance single-flight.
- Match pada window menit bersebelahan untuk member yang sama memakai satu incident agar
  tidak terjadi ban atau card ganda.
- Referensi pesan fallback memiliki TTL 120 detik, batas 2.000, dan dilepas setelah
  finalisasi. Tidak ada konten, URL, attachment, atau raw error di state/panel/log normal.
- `/mod incidents [page]` menampilkan 10 item per halaman dengan Previous/Refresh/Next,
  authorization ulang, stale-page clamp, metadata terikat, dan panel link tervalidasi.
- Kartu private mod-log menyatakan hasil ban dan penghapusan secara eksplisit.

Verification complete:
- Moderation suite: 95/95 lulus.
- Full `npm test`: 229/229 lulus.
- Syntax check seluruh JavaScript, `npm audit --omit=dev`, dan `git diff --check` wajib
  tetap hijau pada final verification.

Live acceptance complete (2026-08-11):
- Discord API mengonfirmasi 12 guild command; `/mod` memuat `status`, `incidents`, dan
  `allow`.
- Runtime `main` v1.13.0 menggantikan proses lama dan terverifikasi tepat satu instance.
- Owner smoke test lokal terhadap guild live lulus: status `monitor/monitor`, prasyarat
  `Siap`, kontrol owner tersedia, dan antrean insiden dapat dibuka.
- Tidak ada pesan publik, perubahan allowlist, atau live ban. Active auto-ban sengaja tidak
  diuji tanpa akun dummy disposable; runtime dibiarkan dalam mode `monitor`.
- Checkpoint v1.13.0 sudah di-merge ke `main`; checkout utama bersih dan menjadi sumber
  runtime serta autostart.
- Proposed SemVer: `v1.13.0`.
- Suggested commit: `Hengs Discord v1.13.0: Add deterministic Anti-Raid`.

## Current checkpoint: v1.12.0

- Proposed version: **v1.12.0**.
- Scope: private moderation queue and report priority on top of the existing Incident
  Report Hub. No automatic punishment, AI judgment, public notification, Canox, or WA
  integration is added.
- `/reports` is guild-only and available only to `OWNER_ID` or role IDs in
  `REPORT_MODERATOR_ROLE_IDS`. The command and every queue component recheck runtime
  authorization.
- Queue entries are active-only (open/claimed), maximum 10 per page, oldest first, with
  priority as deterministic tie-break. Pages are bounded and clamped after state shrinks.
- Queue payloads expose metadata only: Report ID, status, priority, category, relative
  age, claimant, and a validated panel link. Sensitive report fields are excluded.
- Priority defaults to Important for harassment, spam/scam, and inappropriate, otherwise
  Normal. Reviewers can set Normal/Important/Urgent from the private panel.
- Priority changes and legacy migration are revision-safe. Failed panel updates remain
  sync-pending for startup recovery rather than reporting false success.
- `report:` and `reports:` component namespaces are routed independently.
- Anti-Raid remains an explicit v1.13.0 boundary.

Verification complete:
- `node --test`: 134 passed, 0 failed.
- Syntax check: 49 JavaScript files passed.
- `git diff --check` passed.
- `npm audit --omit=dev`: 0 vulnerabilities.
- Read-only server verification from main local state: 0 failures, 0 warnings.
- Focused security/correctness re-review of Task 4: PASS, no actionable findings.

Live acceptance completed:
- Eleven guild slash commands, including `/reports`, are registered. The remote
  `/reports` schema has no unexpected options.
- Hengs Discord restarted as exactly one v1.12.0 instance and reached connected health
  with an advancing heartbeat.
- Owner UI acceptance passed for the empty queue, a non-sensitive technical test report,
  private moderator panel delivery, Normal category default, moderator override to
  Important, metadata-only queue rendering, and Claim.
- The test panel was deleted and the report purged through the official store transition;
  final live state contains zero reports and zero active reports.
- Outsider denial cannot be exercised from Henry's owner account. Pagination/clamping,
  stale-button rejection, permission recheck, and panel-link validation remain covered
  by the 134-test suite instead of creating extra accounts or eleven live dummy reports.
- Anti-Raid remains the separate v1.13.0 checkpoint.

Checkpoint status: committed as `f6d969a`.

Commit: `Hengs Discord v1.12.0: Add private moderation queue`

## Previous checkpoint: v1.11.0

- Incident Report Hub `/report` is committed at `828b3b6` with private intake,
  optional anonymity, evidence validation, moderator workflow, retention, and recovery.
- v1.12.0 only adds triage metadata and queue navigation; the underlying report privacy
  and human-decision boundary remain unchanged.
Live acceptance completed:
- `MOD_LOG_CHANNEL_ID` memakai channel `mod-logs` yang menolak View Channel untuk
  `@everyone`; `REPORT_MODERATOR_ROLE_IDS` kosong sehingga reviewer saat ini owner-only.
- Sepuluh slash command terdaftar dan schema remote `/report` memuat keenam opsi yang
  dirancang.
- Acceptance sintetis memastikan panel masuk channel privat, reporter anonim tidak
  muncul pada embed, kontrol moderator tersedia, dan panel/state uji berhasil dibersihkan.
- Bot berjalan sebagai tepat satu instance `v1.11.0`; runtime health melaporkan
  `connected` setelah restart.
- `restart.bat` lokal sudah diperbaiki ke ASCII/CRLF dan memakai `Start-Sleep` agar aman
  dipanggil secara hidden/non-interaktif.

Optional human smoke test:
- Jalankan satu `/report` non-sensitif dari akun member untuk mengecek UX receipt
  ephemeral. Backend, panel privat, dan cleanup sudah lolos acceptance otomatis.

## Previous checkpoint: v1.10.0

- Community Operations Dashboard `/ops overview` sudah didaftarkan dan live acceptance
  lulus pada satu instance v1.10.0 dengan heartbeat bergerak serta server verification
  0 failure/0 warning.

## Previous checkpoint: v1.9.0

- Proposed version: **v1.9.0**.
- Scope: producer-side Discord runtime health contract; no Canox code or slash-command
  schema is changed.
- Hengs writes an atomic `data/runtime-health.json` snapshot every 30 seconds with
  version, uptime, connection lifecycle, heartbeat, and allowlisted issue metadata.
- Consumers must require schema/service identity and a fresh heartbeat. A `CONNECTED`
  snapshot older than 90 seconds is offline/stale, not healthy.
- Discord ready, shard disconnect/reconnect/resume/error, invalidated session, login
  failure, fatal process errors, and graceful shutdown are mapped explicitly.
- Snapshot I/O failure is isolated and retried on the next heartbeat.
- The instance lock now has its own 30-second heartbeat and five-minute stale recovery,
  fixing a live Windows `EPERM` false-positive for a missing legacy PID.
- Privacy boundary excludes secrets, Discord IDs/names, messages, drafts, documents,
  paths, raw exceptions, and stack traces.
- `node --test`: 55 passed, 0 failed. All 34 JavaScript files pass syntax checks and
  `git diff --check` passes.
- Read-only Discord server verification passed with 0 failures and 0 warnings.
- Live restart passed: v1.9.0 reached `CONNECTED`, heartbeat and uptime advanced after
  one full interval, the lock timestamp refreshed, and a second instance exited without
  replacing the active process. No slash-command registration is required.

Suggested commit after live acceptance:
`Hengs Discord v1.9.0: Add privacy-safe runtime health`

## Completed checkpoint

- Version: **v1.4.0**, committed as `cb035f6`.
- Scope: persistent scheduled announcements in Ops Hub.
- Live acceptance passed on 2026-07-31: a private draft was scheduled, cancelled back to review, and discarded without publication.

## Version-history note

Repository HEAD before this audit was `5b7e604 Hengs Discord v1.1.0: Add private document translation`. The commit contents are actually Ops Hub (`src/ops/`, `/ops`) plus AI model changes; no document-translation service, slash command, or DeepL dependency exists in the tree. Because `v1.1.0` is already on `origin/main`, the safe next version is `v1.1.1`, not a downgrade to `v0.7.0`.

## Ops Hub contract

1. Discord owner runs `/ops draft`, or Canox atomically writes `data/canox-ops-inbox.json` with a unique `id` per draft.
2. Hengs creates a pending panel only in `BOT_SETTINGS_CHANNEL_ID`, with exact-name fallback limited to `🎛️・bot-settings` / `bot-settings`.
3. `OWNER_ID` and `OPS_EDITOR_ROLE_IDS` can create, inspect, Edit, Perpendek, and Regenerate.
4. Only `OWNER_ID` can Publish Now, Jadwalkan, Batalkan Jadwal, or Discard.
5. AI revision claims `pending -> revising` before network I/O; Publish claims `pending -> publishing`. Concurrent actions cannot both proceed.
6. Public embeds disable all mentions and include an internal Draft ID marker for crash recovery.
7. Existing 12-character draft IDs and new 16-character IDs are both accepted by approval buttons.
8. Single-instance lock mencegah launcher ganda menjalankan dua consumer/publisher.
9. Stale Canox `processing-*` files are recovered on startup; ambiguous extras are preserved as failed files instead of overwriting an active inbox.
10. Runtime files remain under ignored `data/`; no permanent external service receives draft state.

## Verification

- `node --check` passed for all 17 JavaScript source and test files.
- `node --test`: 7 tests passed, 0 failed.
- `npm audit --omit=dev` completed with Node system CA support: 4 known transitive `undici` findings remain (3 moderate, 1 high). npm reports no fix without changing the current dependency line; do not disable TLS or force a breaking Discord.js upgrade inside this checkpoint.
- Live Discord test passed: command registration, private panel creation, owner-only Discard, panel finalization, and no-publication behavior were verified.

## Local configuration state

- Present: `OWNER_ID`, `DISCORD_GUILD_ID`, `BOT_SETTINGS_CHANNEL_ID`, and `ANNOUNCE_CHANNEL_ID`.
- The runtime `.env` remains ignored and no credential value is stored in Git.

## Live acceptance result

1. Seven slash commands, including `/ops`, were registered with Henry's explicit approval.
2. Hengs Discord restarted cleanly as one instance and acquired `.dc-bot.lock`.
3. A test draft entered through the atomic Canox inbox path and appeared only in `bot-settings`.
4. Henry pressed Discard; the state became `discarded`, buttons disappeared, and `publication` remained null.
5. Publish and double-click behavior remain available for a later non-test announcement because this acceptance intentionally avoided sending public content.

## Previous checkpoint: v1.2.0

- Proposed version: **v1.2.0**.
- `/translate file:<attachment> to:<language> non_sensitive:true` is implemented locally.
- Source language is auto-detected; target autocomplete comes from DeepL.
- Formats: PDF, DOCX, PPTX, HTML, TXT. PDF OCR remains out of scope.
- Access: `OWNER_ID` plus `TRANSLATE_ALLOWED_USER_IDS`; currently only Henry is configured because no Discord VIP ID has been supplied.
- Privacy: API Free requires explicit non-sensitive confirmation and always displays the vendor-processing warning.
- Runtime: one active job, queue cap 3, 3-minute timeout, usage preflight, bounded-memory download, ephemeral progress/result, and local temp cleanup including stale crash leftovers on startup.
- Security: extension/MIME/size/CDN/signature validation, sanitized output filename, content-free logs, and no document-handle persistence.
- DeepL production client uses native Node fetch; the SDK was removed after its transitive ZIP advisory was identified.

## v1.2.0 verification

- `node --check`: all source and test JavaScript files pass.
- `node --test`: 14 passed, 0 failed.
- Native DeepL integration TXT EN -> ID: done, 29 billed characters, output read successfully, temp cleanup verified.
- `npm audit --omit=dev`: 0 vulnerabilities.
- Local `.env`: DeepL key, owner, timeout, and queue configured; key value remains ignored and was never printed.
- Eight guild slash commands, including `/translate`, were registered with Henry's explicit approval on 2026-07-31.
- Hengs Discord restarted cleanly as one instance; the new process acquired `.dc-bot.lock`, loaded `/translate`, and reached `Discord Bot Online` without startup errors.
- Live Discord attachment acceptance passed: Henry submitted a non-sensitive two-line English TXT, received an ephemeral Indonesian TXT result, and Discord reported 141 billed characters.
- Post-test health check passed: the bot remained online as one instance, no translation error entered the log, and zero `hengs-translate-*` temp directories remained.

Checkpoint status: committed as `e05c2b9`.

## Previous checkpoint: v1.5.0

- Proposed version: **v1.5.0**.
- Scope: moderator draft workflow and privacy-minimized Ops audit.
- `OPS_EDITOR_ROLE_IDS` is an optional comma-separated Discord Role ID allowlist. Blank keeps the existing owner-only behavior.
- Owner and configured editors can run `/ops draft`, `/ops status`, `/ops history`, Edit, Perpendek, and Regenerate.
- Publish Now, Jadwalkan, Batalkan Jadwal, and Discard remain owner-only through runtime checks.
- Role access is re-evaluated on each slash command, button, and modal submission.
- `/ops history [limit]` returns 5–20 recent audit events ephemerally with mention parsing disabled.
- Audit state stores at most 500 events with action, Draft ID, actor, timestamp, and limited operational metadata. Draft title, brief, and body are excluded.
- Old `ops-state.json` files without an audit array migrate in memory to an empty audit history.
- The `/ops` command schema changed, so live acceptance requires Henry's explicit approval for `npm run deploy`.

## v1.5.0 verification

- `node --check`: all 23 source and test JavaScript files pass.
- `node --test`: 29 passed, 0 failed.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `git diff --check` and changed-file credential scan across 13 files pass.
- `package.json` and both package-lock version fields are aligned at 1.5.0.
- Coverage includes editor allowlist, owner-only final actions, edit/schedule modal guards, `/ops history` schema and output, audit privacy, and old-state migration.
- Eight slash commands were registered with Henry's explicit approval. The first TLS attempt failed closed; retry with Node system CA succeeded without disabling certificate verification.
- Bot restarted cleanly as one instance with local v1.5.0 code.
- Live Discord acceptance passed: a private draft was created, edited, discarded, and shown by `/ops history`.
- Final live state passed: audit actions are `draft_created`, `draft_edited`, and `draft_discarded`; audit contains no title/body/brief, publication is null, and zero active drafts remain.
- `OPS_EDITOR_ROLE_IDS` is intentionally still blank. Moderator live acceptance remains optional until Henry supplies a real Discord Role ID.

Checkpoint status: **ready for Henry's manual commit**.

Suggested commit after live acceptance: `Hengs Discord v1.5.0: Add moderator workflow and Ops audit`

## Previous checkpoint: v1.6.0

- Proposed version: **v1.6.0**.
- Scope: owner-approved Community Event Hub with public RSVP, bounded capacity, reminders, cancellation, auto-close, and crash recovery.
- Owner or configured Ops editor can create `/event draft` and inspect `/event status`; Publish Event, Discard, and Batalkan Event remain owner-only at runtime.
- Event state is private and atomic in ignored `data/events-state.json`; public messages expose counts, not RSVP identities.
- Publication, reminder, RSVP, message refresh, and startup recovery are idempotent and disable mention parsing.
- Drafts whose start time has passed cannot be claimed for publication.

## v1.6.0 verification

- All JavaScript syntax checks pass and `node --test` reports 41 passed, 0 failed.
- Read-only server verification passed with zero failures and warnings before live acceptance.
- `npm audit --omit=dev` reports 0 vulnerabilities.
- Nine guild slash commands, including `/event`, were registered with Henry's explicit approval using the Windows certificate store.
- Bot restarted under the existing loop; process inspection confirmed one Discord bot and one separate WhatsApp bot, not duplicate Discord instances.
- Live Discord acceptance passed: exactly one public event, RSVP Hadir 1/2, exactly one one-hour reminder, owner Cancel, state synchronization, and zero remaining buttons.
- The first acceptance attempt exposed publication after an elapsed start time. A double-layer validation plus regression test was added before the successful second run.
- Test announcements may be deleted from Discord after acceptance; finalized local records remain bounded and are not republished.

Checkpoint status: **ready for Henry's manual commit**.

Suggested commit after live acceptance: `Hengs Discord v1.6.0: Add approved Community Event Hub`

## Previous checkpoint: v1.7.0

- Proposed version: **v1.7.0**.
- Scope: private Canox-to-Event Hub intake for researched or structured community events.
- Canox writes `data/canox-event-inbox.json` atomically; Hengs consumes it into `bot-settings` and never publishes automatically.
- Event and Ops inboxes are separate. Payload validation is all-or-nothing and external IDs make retries idempotent.
- Optional source provenance is shown as a safe HTTP(S) link. Publish, Discard, Cancel, RSVP, reminders, and target channels remain controlled by Hengs.
- Slash command schema is unchanged; no command registration is required for v1.7.0.

## v1.7.0 verification

- `node --check` passes for changed Event Hub source/tests.
- `node --test`: 44 passed, 0 failed before live acceptance.
- Coverage includes mixed invalid payload rejection, private-only delivery, retry idempotency, timezone enforcement, credential-bearing URL rejection, and stale processing recovery.
- Canox companion checkpoint v0.33.0 has 108 passing tests and exposes only draft/status routes.
- Live acceptance passed: production Canox sender created exactly one private panel with source provenance; owner Discard left publication null, removed all buttons, and left no inbox/processing file.

Checkpoint status: **ready for Henry's manual commit**.

Suggested commit after live acceptance: `Hengs Discord v1.7.0: Accept private Canox event drafts`

## Previous checkpoint: v1.8.0

- Proposed version: **v1.8.0**.
- Scope: private Event Draft Editor on the existing Event Hub approval panel.
- Owner and configured `OPS_EDITOR_ROLE_IDS` can edit title, description, WIB time,
  location, capacity, and source URL while the event remains a draft.
- Publish, Discard, and Cancel remain owner-only. Button visibility is not trusted;
  authorization is checked again for every button and modal submission.
- Editing is split into two modals because Discord allows at most five inputs per
  modal. This does not change the `/event` slash command schema.
- Persistent revision compare-and-set rejects stale forms, preventing simultaneous
  editors from overwriting newer changes.
- Event edit audit records actor, revision, and changed field names only. Event
  contents are excluded.

## v1.8.0 verification

- All JavaScript syntax checks pass.
- `node --test`: 46 passed, 0 failed.
- `git diff --check` passes.
- Coverage includes unauthorized buttons, forged modal submission, editor allowlist,
  both edit modals, field validation, panel synchronization, stale revision rejection,
  owner-only Publish/Discard, and edit rejection after publication starts.
- Slash command registration is not required because the command schema is unchanged.
- Live Discord acceptance was intentionally skipped at Henry's request; automated
  interaction tests cover the complete editor flow.

Checkpoint status: **ready for Henry's review and manual commit**.

Suggested commit: `Hengs Discord v1.8.0: Add revision-safe event draft editor`
