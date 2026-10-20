# Hengs Discord Bot - Handoff

Updated: 2026-10-20

## Hengs Discord v1.64.1 role emoji local checkpoint - 2026-10-20

- Henry asked for icons on role names without one and for hasil-scrim to be readable by everyone but
  postable only by Hengs Family. roles-check.sh (read-only) showed premium tier 0 (no ROLE_ICONS), the
  bot's top role at position 21 (below Owner and Hengs Family), managed bot roles for Jockie Music x2,
  Lofi Radio, OwO, Carl-bot and Luminary Tracker, and the hasil-scrim overwrites already as requested
  (@everyone view and history, send and threads denied; Hengs Family and Hengs view, send, embed,
  attach, history). Administrator also sits on Owner, Bots, Jockie Music x2 and OwO; those bypass
  channel rules.
- role-icons.sh renamed Mobile Legends, Valorant, Roblox, Announcements and Events with the get-roles
  emoji (exact old name required, below the bot, not managed). Hengs Family is above the bot and must be
  renamed by Henry, but findTeamRole matched the exact name, so v1.64.1 normalizes it like the channel.
- QA: Node 22 full suite 720/720 locally. Not deployed: Hengs Family must keep its plain name until
  v1.64.1 is live. Deploy helpers can be derived from deploy-v1640 (no command re-registration needed;
  command shapes did not change).
- Commit subject: fix(scrim): Hengs Discord v1.64.1 - accept an emoji prefix on the team role

## Scrim tim provisioned at owner request - 2026-10-20

- A read-only REST check (.cloud/automation/deploy-v1640/scrim-check.sh, as hengs-discord) found no
  Hengs Family role and no hasil-scrim channel: /admin setup > Scrim tim had never been run. Henry then
  asked: "Buat channel scrim lu buatin dong, sekalian role nya juga."
- scrim-setup.sh ran once as hengs-discord (systemd-run, discord.env): a short-lived second gateway
  session (Guilds intent only) fetched the home guild and called ensureScrimSetup with roleId and
  channelId null, so it would have refused if either already existed. Result CREATED_ROLE=1
  CREATED_CHANNEL=1 PARENT=SET (Gaming). Post-check CHANNEL_TEXT=1 ROLE=1; DC 1.64.0 CONNECTED/OK/fresh,
  13 home commands incl. /scrim hasil; no restart. Ran after the WA v0.50.0 deploy was accepted.
- Next: Henry adds teammates to Hengs Family (Server Settings > Members) and dogfoods /scrim hasil in
  bot-commands.

## Hengs Discord v1.64.0 deployed with v1.63.0 - 2026-10-20

- Henry approved: deploy v1.64.0 (includes Casterin v1.63.0) now, Gemini key later, one controlled
  restart, WhatsApp untouched. Exact code 7693c082931d7fcae93f326dcddf6be8aa7aabe0, archive
  hengs-discord-1.64.0-7693c082931d.tar.gz SHA-256 21c6d3b5bc437832e859ca2a4f48ff8853e4b916407e3b490bebfe2f3045d7d3
  (built from PowerShell). Ignored operators: .cloud/automation/deploy-v1640 (derived from deploy-v1620 by
  script; news migration removed because schema stays 3).
- Preflight PASS at 01:59 WIB (outside the 07-10 WIB news window). Status ACCEPTED VERSION=1.64.0 TESTS=719
  PASS=716 CHECKOUT_SKIPS=3 HEALTH=TWO_FRESH MEMORY=ON WA=UNCHANGED CANOX=UNCHANGED NEWS=UNCHANGED.
  Independent audit PASS (DC 1.64.0, WA 0.47.0 fresh, single consumers, zero restarts, staging absent,
  rollback 1.62.0 available).
- register-commands.sh ran deploy-commands.js once as hengs-discord with /etc/hengs/discord.env
  (COMMAND_REGISTRATION_OK, global + home PUT). Read-only check: 13 home commands, /caster present,
  /scrim has hasil. No token printed or transferred; no GEMINI_API_KEY installed yet.
- Not yet proven: owner /admin setup -> Scrim tim live (role + channel creation), a Hengs Family member
  /scrim hasil end to end (CDN download, post, record), Casterin voice (needs key). Members currently get
  "Casterin belum aktif." from /caster.
- Next: owner runs /admin setup -> Scrim tim in bot-commands, adds members to Hengs Family, one member tests
  /scrim hasil. Casterin activation: install the existing Hengs Gemini key (not the Canox key) into
  /etc/hengs/discord.env with a reviewed secret-transfer step, restart once, test one shout per persona.
- Hengs Coach research and phased design: docs/research/2026-10-20-hengs-coach.md and
  docs/superpowers/specs/2026-10-20-hengs-coach-design.md (both ignored). Recommendation: phase 1 recap
  from own scrim data first; vision only after a 10-screenshot accuracy test; no Gemini free tier for SS.
- Docs commit: docs(deploy): Hengs Discord v1.64.0 - record cloud acceptance and command registration

## Hengs Discord v1.64.0 scrim results channel (local, not deployed)

- Henry chose: channel plus submit via Hengs, team-role-only posting, new role "Hengs Family".
  Future direction only: Hengs as coach reading results and meta from data; v1.64.0 stores clean
  structured results for that. Design/spec/plan: docs/superpowers/specs/2026-10-19-scrim-results-design.md (ignored).
- New src/scrim/{store,service}.js. `/scrim hasil` (attachment + lawan/skor/hasil/game/catatan) gives a
  private preview, then one send posts the screenshot and card in hasil-scrim without pings and records
  data/scrim-results.json (schema 1, newest 500 per guild, IDs and typed fields only, no image bytes/URLs).
- `/admin setup` gains "Scrim tim": preview, then confirmed create/reuse of the permissionless Hengs Family
  role and `📸・hasil-scrim` under Gaming (everyone read; team role and Hengs send/attach/embed). Role
  assignment stays manual. Existing channel: only @everyone, team role and Hengs overwrites are edited.
- Built on top of the Casterin commit a716830 (v1.63.0) in the same checkout after that session went
  idle; it agreed not to edit discord-bot until this checkpoint lands. src/caster untouched.
- QA: 9 new scrim tests; full suite result recorded in the commit report. Not proven: live Discord role/
  channel creation, CDN download from a real attachment, and member UI. Needs dogfood after deploy.
- Combined DC deploy (v1.63.0 + v1.64.0) needs Henry's explicit approval: GEMINI_API_KEY (and optional
  CASTER_DAILY_LIMIT) in /etc/hengs/discord.env, Node22 candidate tests, controlled restart, then
  `npm run deploy` to register /caster and the updated /scrim in the home guild. After deploy: owner runs
  /admin setup -> Scrim tim, adds team members to Hengs Family, one member tries /scrim hasil in
  bot-commands. Run the full suite from PowerShell; Git Bash GNU tar breaks state-transfer tests.
- Commit subject: feat(scrim): Hengs Discord v1.64.0 - add team scrim results channel

## Hengs Discord v1.63.0 Casterin audio caster (local, not deployed)

- `/caster` per local spec docs/superpowers/specs/2026-10-19-casterin-design.md and research
  docs/research/2026-10-19-casterin.md (both ignored). New: src/caster/{personas,service}.js,
  src/commands/caster.js, test/caster.test.js. Changed: Groq client export in src/agent.js, service
  wiring + hengs-caster: button route in src/index.js, help/privacy lines.
- Groq gpt-oss-120b writes one shout (strict JSON, refusal path); Gemini 3.8 Flash TTS voices it,
  Flash-Lite on 429. Probed 2026-10-19: free tier 3 RPM / 10 RPD per model, reset 00:00 UTC.
- RAM-only limits and drafts; no dependency, schema, state file or backup change. freeCommands unchanged.
- QA: local Node24 full suite 710/710 passed from PowerShell (694 baseline + 16 Casterin), zero
  failures/skips. Under Git Bash, 5 cloud state-transfer tests fail TAR_FAILED (GNU tar misreads
  C:\ paths); environment-only, same on the untouched baseline. Node22 candidate run belongs to deploy.
- .env.example not updated: project guard Edit(**/.env.*) blocks agents; GEMINI_API_KEY and
  CASTER_DAILY_LIMIT are documented in README.
- Next: Henry uses the existing Gemini key for Hengs (not the Canox key; motion-lab TTS shares it), one key, no rotation. Then, only with explicit
  authorization, deploy per docs/CLOUD-DEPLOY.md: secret transfer (GEMINI_API_KEY, CASTER_DAILY_LIMIT),
  Node22 candidate tests, controlled restart, npm run deploy for home guild commands, manual checks
  (one shout per persona, inline WAV desktop + mobile, Kirim/Ulang/Batal, non-admin channel guard).
- Commit subject: feat(caster): Hengs Discord v1.63.0 - add Casterin audio caster command

## Hengs Discord v1.62.0 channel activation accepted

- Owner UI in bot-commands completed the limited News + memes setup, reusing news and creating
  memes. Direct view/history/send/files/embed permissions verified by read-only REST; no guild
  role changes or full setup. Both channels now reside in Announcements, outside Bot Center.
- Explicit route draft -> private preview -> terapkan berita preserved active/tested schedule,
  receipts and history. Slots remain 08:00/09:00 news, 10:00 entertainment, at most two plus one.
  Empty/freshness-filtered slots skip. Preview had no fresh item, not a fabricated digest.
- Private joke share preview/cancel passed with visible confirmation that no new post was sent.
  No public dogfood post, member ping, ordinary-member account test or real news delivery claimed.
- A single bot REST placement attempt failed at PLACEMENT, with unchanged channel readback.
  Owner UI then moved both channels successfully, retaining the direct posting overwrites.
  Do not rerun ignored place-channels.sh. Read-only channels-read.sh and audit.sh passed.
- Cloud remains DC1.62.0, WA0.46.0, fresh single-consumer, zero restarts; Canox unchanged.
  No deployment, restart, QR, token/auth change, reboot, restore or cloud provisioning this turn.
- Screenshot: ignored .cloud/automation/deploy-v1620/channel-acceptance.png. Scope is now closed;
  next work is WA sleep intent/status consistency and contextual conversational tone.
- Documentation-only checkpoint at1.62.0. Commit subject:
  docs(news): Hengs Discord v1.62.0 - record split channel activation

## Previous checkpoint: cloud accepted on 2026-10-18 (activation completed above)

- Henry authorized deployment and narrowly scoped news/memes setup. Exact source
  86de70314dc8673a838d9bc3c0e2dd4a7df2bd6e is live at immutable1.62.0-86de70314dc8.
- Fresh preflight passed; local Node24 suite694/694 passed. Candidate Node22 tests ran before
  stopping Discord:694total,691passed,0failed,3 expected checkout-only skips. No dependency
  additions. One controlled restart passed two fresh advancing CONNECTED/OK heartbeats.
- News schema2 ->3 applied atomically while service stopped: only nullable memeChannelId added,
  with owner/mode/settings/revisions/timestamps/history preserved. No stale receipt restoration.
  News remains active/tested,08:00WIB,count3. Missing meme route skips entertainment safely.
- Final audit: Discord1.62.0 and WA0.46.0 active/enabled/fresh, one consumer each, NRestarts0;
  Canox memory-only0.178.0 unchanged. WA/Canox PIDs, releases and environment fingerprints
  unchanged. Local bot processes0/autostartoff. Transfer/staging absent, rollback1.61.0 available.
- Read-only Discord REST verified one existing news destination, no memes destination yet,
  neither direct-member setup nor split route applied. No channel, role, permission or public
  message changes in this turn. No QR, reboot, restore, backup, token change or Oracle action.
- Owner Discord browser session expired. Asked Henry to log in privately; no password/OTP or
  user token collected. Do not substitute bot credentials for an owner interaction or claim live
  member UI dogfooding complete. Native setup, share preview/cancel and route apply remain pending.
- Ignored operators: .cloud/automation/deploy-v1620. Deployment status ACCEPTED; do not rerun
  stage/dispatch. Read-only audit.sh and channels-read.sh may verify the current baseline.
- Next after login: in bot-commands use /admin setup -> News + memes -> exact limited preview
  confirm (not full setup); verify channel placement beside news, configure distinct route via
  atur berita / preview berita / terapkan berita, preserve receipts and existing08/09/10 schedule.
  Test only in bot-commands; no fake news or member pings. Review native permissions and private
  relay preview/cancel, then document actual activation. No new deployment is needed for setup.
- Documentation-only checkpoint at1.62.0; no active temporary spec/plan. Commit subject:
  docs(deploy): Hengs Discord v1.62.0 - record cloud acceptance and pending channel setup

## Hengs Discord v1.62.0 split channels and member sharing

- Henry selected direct posting, without an admin queue. Implemented separate news/meme
  routing, optional narrowly scoped News + memes setup, and member self-confirm sharing from
  bot-commands. No AI approval/censorship or claim that member links/images are verified safe.
- News schema3 adds nullable memeChannelId. Missing meme destination skips entertainment;
  never falls back to news. Existing receipt/seen evidence survives upgrade. Downgrade1/2
  preserves current receipts and pauses schedules with entertainment before starting old code.
  No stale receipt restore. Quotas, spacing, publishers and scheduled visuals unchanged.
- Members can post natively after owner-confirmed channel permission setup. Bot relay accepts
  explicit HTTPS news links, text jokes or own same-channel Discord raster image-message links.
  RAM preview expires10min; same actor confirms, with fresh destination/source permissions,
  timeout, route, author and content checks. Source allowlists unchanged. Images are linked,
  not downloaded/reuploaded; native upload is the inline-image path. No content file or LLM use.
- Replay/reset/shutdown/expiry/revocation fail closed; bounded100 drafts/operations and200
  cooldown entries, 60s actor+guild cadence, in-flight guild send lock, nonce enforcement.
  Native slowmode requires native posting. Ambiguous sends/mutations are consumed, not retried.
- Security review covered privilege laundering, source privacy, mentions/unfurls, unsafe URL
  forms, formatted-length overflow, stale inventory, source edits, partial setup and shutdown.
  Final fix rechecks inventory after apply acknowledgement and expiry after fresh role read.
  Existing overwrite grants remain untouched except the five previewed @everyone participation
  bits. No broad role change, mass ping, hidden-source forwarding or automatic image fetching.
- QA: full offline Node24 suite passed. Final focused102/102 passed, zero failures/skips
  (news/store/schema/backup selection, sharing, optional setup, help, cloud release policy).
  Tests use synthetic data, approved temporary filesystem access, no ACL modifications.
  Node22 cloud candidate/live dogfooding remain for the authorized deployment gate.
- Main files: src/news/{sharing,service,store,prompts}.js, src/guilds/admin-setup.js,
  src/commands/hengs.js, src/prompt-assistant.js, src/community-help.js, src/index.js,
  related tests, package/lock metadata and public/canonical docs. No dependencies added.
- No deployment, real Discord send/channel/permission/state change, provider request,
  bot-local start, WA/Canox action or new automation in this checkpoint. Cloud last accepted
  exact v1.61.0 code82c94b168118447f3d3b8d9d44000d1a133e0cdf; not rechecked this turn.
- Release subject: feat(news): Hengs Discord v1.62.0 - split channels and enable member sharing
  Code checkpoint16c4a02 committed and pushed to origin/main. Handoff synchronization follows
  as a documentation-only checkpoint at the same version. No repository-hosted CI workflow exists.
- Next: obtain explicit deployment/activation authorization, test exact committed candidate
  with Node22, stop Discord for validated schema3 migration and controlled restart, verify two
  fresh heartbeats. Separately preview/confirm channel setup and route application; never run
  full-server setup or publish test content outside bot-commands. See docs/NEWS-DIRECTION.md
  and docs/CLOUD-DEPLOY.md for contract and rollback. No temporary active spec/plan to retain.

## Hengs Discord v1.61.1 cleaner news cards and next routing gate

- Henry requested separate news/meme channels, no availability counters, and member submissions
  from destination channels or bot-commands. Independent presentation fix removes the counters
  and names entertainment-only cards Hengs Memes. Sources, timestamps, no-mention policy and
  image/fallback validation unchanged. No live deploy, channel creation, permission/state change,
  provider call, submission capture, WA/Canox mutation or message publication occurred.
- One material policy question is pending: reviewed contributions (recommended) versus direct
  member posting. Combined architecture/design/implementation package is in ignored canonical
  docs/NEWS-DIRECTION.md. Do not implement new persistent intake or widen permissions until
  that choice approves/replaces the package. No new overlapping temporary spec/plan created.
- Cloud stays exact v1.61.0 code82c94b168118447f3d3b8d9d44000d1a133e0cdf. Last verified live
  acceptance is below; this task has not rechecked runtime. Local release metadata is1.61.1.
- Regression was first reproduced with two failing assertions, then presentation24/24 passed.
  Integrated scoped QA72/72 passed (all News, shared help and release policy/metadata), zero
  skips/failures. Sandbox temp atomic rename was denied; one approved offline rerun outside
  sandbox passed without ACL changes. Syntax/whitespace and secret boundaries passed. Only
  static renderer copy changed; existing source/image allowlists and mention guards unchanged.
  No new dependency or SDK/API contract. Full unrelated suite was not rerun for this copy patch.
- Intended checkpoint: fix(news): Hengs Discord v1.61.1 - simplify news and entertainment cards
  Next: get the contribution policy answer, then implement split routing and intake as one
  coherent batch; keep deployment as its own approved operational step.

## Hengs Discord v1.61.0 cloud acceptance and public invite

- Henry approved deployment and adding the installation link to the application description.
  Exact code commit 82c94b168118447f3d3b8d9d44000d1a133e0cdf is live at immutable release
  1.61.0-82c94b168118. Previous 1.60.0-9e43212d1715 remains available for schema-aware rollback.
- Candidate Node22 QA completed before stopping Discord: 664 total, 661 passed, zero failed,
  three expected checkout-only skips (tracked-content, tracked LF assets, sibling checkout).
  One controlled Discord restart passed two fresh advancing CONNECTED/OK heartbeats;
  active/enabled, exactly one service-owned consumer, zero supervised restarts, memory still on.
- News schema1 migrated atomically to schema2 while Discord was stopped, preserving ownership,
  mode, settings, revisions, history and timestamps. Legacy receipts consume their entire day.
  No news was sent to test the migration. Rollback must run conservative downgradeState before
  starting the old binary; never restore a stale receipt snapshot. Rollback was not needed.
- WA v0.46.0 and Canox memory-only v0.178.0 stayed unchanged, with no restart. Environment
  fingerprints unchanged; local bot processes zero and autostart off. Final cloud audit passed:
  both bots fresh/single-consumer, zero supervised restarts, staging absent, rollback available.
- Discord application REST readback confirms public installation, no code grant, and the
  verified minimal-permission OAuth invite in its description. Only description changed;
  application identity, icon, flags and installation settings/permissions were preserved.
  Friends can open the README invite, select their server, then run /setup start and /hengs help.
  No installation in a friend's guild, real news delivery or member notification was performed.
- Native appreciation picker/form behavior has offline coverage, not claimed live dogfooding.
  Ops destinations still use announcements; reusable Hall/certificate routing remains deferred.
  No QR, auth reset, reboot, restore, backup, command registration or new resource occurred.
- Documentation-only checkpoint, product version unchanged. Subject:
  docs(deploy): Hengs Discord v1.61.0 - record spaced news acceptance and public invite
  Next: member UI dogfooding in bot-commands; do not send news or ping players merely to test.

## Hengs Discord v1.61.0 implementation checkpoint (before deployment above)

- Henry requested spaced news, easier help, gallery guidance, bullet rosters and optional tags.
  Implemented as one local batch on main. Cloud code still v1.60.0; no restart/deploy, bot launch,
  provider call, news send, new resource, auth change, backup/restore or Canox/WA mutation.
- News: one item per hourly slot, fixed minimum60min gap, max3/day; mixed edition reserves the
  final slot for comic. 08:00/09:00/10:00 WIB is the existing schedule's intended behavior after
  deploy. Expired and after-midnight slots are skipped, not caught up. Durable slot nonce/claims,
  publisher diversity, fresh revision checks, empty/failure consumption and no ambiguous retries.
- News schema2 upgrades validated schema1 in RAM and on next atomic write; legacy/manual
  claims consume a whole day. Existing enabled/tested/settings/history survive. Rollback BEFORE
  old binary start requires exported downgradeState under stopped service and validated atomic
  write, conservatively coalescing used days. Never restore stale receipts. Canonical contract:
  ignored docs/NEWS-DIRECTION.md. Deploy remains a separate explicit gate.
- Help is shared between /hengs help and natural help, member-first with privilege-specific
  controls. Hall prompts redirect privately via slash and public mentions are ignored in the
  exact gallery channel (not discussion threads). Native roster modal still one person per line;
  stored canonical text remains compatible and display renders escaped bullets.
- Optional tag picker: home/editor/actor/revision bound, fresh same-guild non-bot validation,
  <=8 explicit selections, default none. Additive version1 metadata comes only from the picker,
  not AI/Canox/free-text ingestion. Edits clear selections. Preview never pings; owner publication
  alone emits explicit allowed user mentions after revalidation. Tagged ambiguous sends remain
  held for operator review, with no automatic retry/release on restart when outcome is unproven.
  Manual/scheduled paths share validator. Canonical ignored docs/APPRECIATION-DIRECTION.md.
- Live scope completed separately: existing Hall post roster changed to five bullets, same
  poster and original certificate URLs/content verified. One request guide sent and pinned;
  topic points to bot-commands. Readback verified no user mentions, no everyone, unchanged
  permissions. Private receipt/operator under ignored .cloud/automation/appreciation-v1600.
  Do not rerun refine-hall.sh: one-shot marker exists. No retroactive player notifications.
- Ops destination remains announcements; reusable Hall destination/certificate intake is NOT
  implemented in this batch. The current Hall post and instruction are supervised operations.
- Verification: integrated offline suite 664/664, zero skips/failures on Node24.15.0; Node22
  remains package/cloud runtime and requires candidate acceptance at deploy. Nineteen modified
  JS files pass syntax; whitespace/content/secret boundaries reviewed. Sandbox temp rename and
  symlink permission failures were resolved by workspace temp plus an approved offline test
  run outside sandbox, without ACL changes. Focused final schema regression also run.
- Checkpoint subject: feat(community): Hengs Discord v1.61.0 - space news and simplify appreciation
  Commit/push main per standing policy after verification. No tracked GitHub workflow exists;
  do not infer hosted CI success from local tests. Next: approved controlled Discord deploy,
  schema-aware rollback preparation, two moving health heartbeats, then real UI dogfooding in
  bot-commands. Do not run a real news send or member ping merely to test.

## Hengs Discord v1.60.0 Hall of Fame publication

- Henry approved the proposed dedicated channel and final publication. Created exactly one
  hall-of-fame text channel under the existing Community category after read-only duplicate,
  category and bot-capability checks. No other channel/category or guild-wide role was changed.
- Channel-specific permissions inherit visibility, allow member history/reactions/public threads
  and thread replies, and deny ordinary main-channel messages. Hengs has an explicit posting
  overwrite; administrators retain their usual Discord access. Readback checked exact overwrites,
  baseline member visibility, and ordinary role permissions without changing existing roles.
- Exactly one final post by Hengs contains the reviewed poster, full five-player roster and
  unchanged organizer certificate. No mentions, mass ping, scheduled send or duplicate post.
  REST readback verified two images and exact certificate bytes; authenticated Discord UI verified
  the channel under Community, caption, roster, poster and certificate. Private receipt and
  screenshot stay ignored, not in Git. The earlier bot-channel test remains unchanged.
- No deploy or restart. Discord v1.60.0 and WA v0.46.0 health fresh, single consumer each,
  zero supervised restarts, Canox memory v0.178.0 unchanged. Publication staging was removed.
- This was a scoped operator publication, not an implementation of reusable certificate intake
  or Hall of Fame routing in Ops. Existing draft publication destinations remain unchanged.
  Next product work, if requested: integrate an explicitly selected Hall of Fame destination and
  reviewed optional certificate attachments into the existing draft flow before claiming automation.
- Documentation checkpoint only, product version unchanged. Subject: docs(community): Hengs
  Discord v1.60.0 - record Hall of Fame channel and first publication.

## Hengs Discord v1.60.0 cloud acceptance and certificate dogfooding

- Henry approved controlled deployment and a supervised certificate upload in the bot test
  channel. Exact code HEAD 9e43212d1715111382a80c99b5f3694a2a535f4b is live at immutable release
  1.60.0-9e43212d1715. Previous 1.58.0-69c196ca5ca9 remains available for rollback.
- Node22 candidate QA: 654 total, 651 passed, zero failed, three expected checkout-only skips
  (tracked-content, tracked LF assets and sibling shared-runtime checkout). Local Node24 full
  suite previously passed 654/654. Tests completed before stopping production Discord.
- Atomic activation preserved auth/state/config. Two fresh moving CONNECTED/OK heartbeats,
  active/enabled, one service-owned Node process matching MainPID, zero supervised restarts.
  Private Canox memory remains on; news tested/active configuration and receipt unchanged.
  WA v0.46.0 and Canox memory-only v0.178.0 were not restarted or changed. Local bots stay stopped.
- One explicitly labeled test message was sent by Hengs with the production Crown Stage poster
  and the original organizer certificate. Owner resolved the event-name discrepancy in favor of
  the certificate. Roster/date remain owner-supplied, not claimed to be printed on the certificate.
  No mentions, announcements publication, new channel or general certificate ingestion feature.
- Readback verified two embed images, the expected poster and 1600x1131 certificate. Certificate
  download checksum exactly matched the original. Discord represented these inline images in
  embeds with an empty attachments list: initial verification stopped, then the read-only checker
  was corrected; no second send occurred. Both images were opened and visually verified in
  Henry's authenticated Discord browser. Private screenshots/receipt stay outside Git.
- Deployment/upload staging was removed; fixed-code final audit passed with both bot health
  probes fresh, single consumers, rollback available, and Canox unchanged. No QR, reboot,
  auth reset, restore, backup, new cloud resources, or news schedule changes.
- Coverage limit: the actual bot-send/renderer/certificate display was dogfooded. Native modal
  creation and structured Edit have offline regression coverage, not a claimed live acceptance.
- Recommended next: ask Henry to approve a dedicated hall-of-fame channel and final publication
  destination before creating it or publishing. Certificate integration into reusable Ops draft
  intake still needs its own scoped implementation; current upload was a one-off operator.
- Documentation-only checkpoint, no version bump. Subject: docs(deploy): Hengs Discord v1.60.0
  - record Crown Stage acceptance and certificate dogfooding.

## Hengs Discord v1.60.0 Crown Stage local implementation (subsequently deployed above)

- Approved local implementation replaces the appreciation graphic with the selected art-led
  Crown Stage composition. Bundled stage, trophy, transparent crest derivative, Barlow fonts
  and Phosphor icons have provenance/licenses in assets/appreciation/crown-stage/README.md.
  Original assets/brand/hengs-family.png hash is unchanged. No new generation in this port.
- Literal result/team/event/date/roster remain driven by bounded Ops draft fields. Only explicit
  ranks are promoted; generic appreciation has no invented ranking. No-logo uses a trophy.
  0-8 players, optional nickname, 2-3 centered columns, long names/details wrap without clipping.
  Width 1080px, height 1350-3600px; full text remains in the embed and on render failure.
- Canonical card Edit now opens a prefilled five-field modal. Actor/home/current editor access,
  pending status and draft fingerprint are rechecked synchronously before save. Stale submissions
  do not overwrite newer revisions; raw edit callbacks cannot break canonical card templates.
  Panel updates recheck state after awaited rendering. Owner-only publish/schedule unchanged.
- No new state/schema, provider, certificate intake/OCR, channel, role, points or auto-publish.
  Decoded fixed art is cached once per process, never user data/posters. No user URL/path loading.
  Certificate proposal remains deferred. Real roster fixture and previews remain ignored/local.
- QA: full offline 654/654 passed on available Node24.15.0; runtime/package stays Node22.
  Changed JS syntax, original crest hash, visual inspection of actual production renderer
  (five-player crest, no-logo trophy, generic eight-player roster), whitespace and release
  content checks. Ordinary-temp offline test run required for known sandbox rename EPERM;
  no ACL changes. Initial full run caught one stale version assertion, corrected before rerun.
- Main areas: src/utils/appreciation-card.js, src/ops/appreciation-form.js, src/ops/hub.js,
  asset bundle, offline preview, focused tests and public documentation. No bot/cloud mutation,
  live Discord acceptance, deployment, or production version change claimed.
- Intended commit: feat(appreciation): Hengs Discord v1.60.0 - add adaptive Crown Stage posters.
  Next gate: separately approved cloud deployment with Node22 acceptance, then private bot-channel
  dogfooding before Henry approves publication. Production last verified remains v1.58.0.

## Hengs Discord v1.59.0 visual follow-up (preview only)

- Henry selected A / Victory Arena, one adaptive with/without-logo composition, and corrected
  the current team name to Hengs Family. Asset provenance docs now reflect that name; the crest
  stays unchanged and Familia remains a compatibility alias in existing production code.
- Later offline v2 previews strengthen result/team hierarchy and use an equal five-player lineup.
  Private event/roster data, scripts and PNGs remain ignored under .cloud/previews. They are not
  the renderer currently shipped in v1.59.0. Canonical design notes: docs/APPRECIATION-DIRECTION.md.
- Optional certificate presentation is a proposal, not implemented. Henry has no actual file
  yet and approved a labeled placeholder. Preserve an eventual organizer certificate unchanged;
  missing player names belong on a separate owner-reviewed Hengs roster, not the source document.
- Verification for this docs-only checkpoint: offline preview rendering, syntax, visual review
  at 320px and full size, exact unchanged logo hash, scoped diff and whitespace checks. No new
  runtime test coverage or live Discord acceptance claimed. Earlier 651/651 refers to the code
  checkpoint below, not a new run. No bot, cloud, upload, provider, QR or deployment changes.
- Product version stays 1.59.0 because this changes documentation/ignored previews only.
  Subject: docs(appreciation): Hengs Discord v1.59.0 - correct team name and record visual direction.
- Next: implement the selected adaptive visual renderer locally, with production-safe fonts;
  review attachment security/data boundaries separately before adding certificate ingestion.

## Hengs Discord v1.59.0 appreciation cards (not deployed)

- Approved local continuation adds appreciation/Hall of Fame through ordinary Ops announcement
  drafts. This is a reviewed card, not a new award database, XP, leaderboard, role or channel.
- Owner/editor can ask `bikin kartu apresiasi`, open an actor-bound five-field modal, and enter
  recipient, achievement, optional occasion/date and up to eight players. Nicknames optional.
  Complete explicit prompts use a deterministic template, never a model or invented facts.
  Home guild, requester and current editor access are rechecked for both form callbacks. Mere
  Administrator is not enough for this feature. Owner remains sole publisher/scheduler.
- Canonical labels in existing title/body opt into decoration; no extra persisted keys/schema.
  Bounded strings, mentions off, literal Markdown, private bot-settings review and same graphic
  on manual/scheduled publication. Manual noncanonical edits clear stale images; AI rewrite is
  disabled for template drafts. Render failure preserves the reviewed text with a fixed code.
  Claim-before-send and footer recovery ID remain intact across awaited bitmap decoding.
- Supplied Hengs Family crest remains byte-for-byte unchanged, with provenance under assets/brand.
  Exact recipient Hengs Familia/Family selects it; other recipients use a Canvas trophy. No URL
  fetch or per-user asset path. Henry's actual roster/date preview stays ignored in .cloud/previews,
  not source/test fixtures. No appreciation has been posted, no production state was changed.
- Welcome/leave stay Aurora 900x280 but make member display name the hero and actual username
  the handle; caption gets two lines. Existing duplicate-onboarding fix and News patch included.
- QA: full offline suite 651/651 on available Node24; package/runtime remains pinned Node22.
  Ordinary-temp execution required for known sandbox atomic-rename EPERM; no ACL/policy edits.
  Added 16 regression tests covering literal data, parser fallback, permission, callback replay,
  persistence compatibility, publication claims, render fallback and actual decoded logo pixels.
- Scoped independent review found permission mismatch and parser/Markdown issues; all corrected.
  Targeted re-review found no new regression, including awaited rendering and claim ordering.
  Visual review used actual offline PNG at 550/320px plus long-name, welcome and leave cases.
  Full text remains in Discord because secondary card details become small on mobile.
  No new visual world/image generation: incumbent Aurora and supplied crest are retained.
- Public contracts: docs/COMMUNITY-OPERATIONS.md, docs/WELCOME_CARD_BRIEF.md, assets/brand/README.md.
  Internal architecture review stays in docs/APPRECIATION-DIRECTION.md as the active contract;
  no disposable Superpowers spec/plan was created. No graph rebuild; historic graph was navigation
  only and current code/tests supplied evidence. No bot start, Discord write, QR or cloud call.
- Release subject: feat(appreciation): Hengs Discord v1.59.0 - add reviewed achievement cards and roster forms.
- Next gate: deploy the combined checkpoint only with explicit approval, controlled Discord-only
  restart and bot-commands/private review acceptance. Last verified cloud remains v1.58.0.
  WA/Canox and the disabled Oracle watcher remain untouched. Never publish the real award as a test.

## Hengs Discord v1.58.2 welcome correction (not deployed)

- Henry reported the Oct15 welcome screenshot with duplicated greeting, rules/roles/announcements
  and help. Confirmed in GuildMemberAdd: the legacy default description was composed with the newer
  onboarding fields. This was duplicate content in one message, not proof of duplicate consumers.
- One testable home welcome builder now owns title, short introduction, four compact channel
  steps and one help field. Card and no-card branches share it. Custom copy is preserved; existing
  already-sent welcomes are not edited. The card's default caption is shorter, with no new assets.
- Configured channel IDs remain first choice, text-only fallback now includes Indonesian aliases.
  Invalid channel references fall back to safe labels. Names escape Markdown/masked links and
  runtime sends still disable mentions. No change to auto-role, public guild welcome or state.
- Four new regression tests cover exact-once default content/links, custom copy, name/reference
  safety, Indonesian aliases and configured priority. Full offline suite 635/635 passed on Node24;
  the sandbox's known temp atomic-rename EPERM was resolved by an approved ordinary-temp run,
  not filesystem-policy edits. No provider call, bot start, production mutation or public test.
- Final documentation/access/content QA 13/13, syntax for all five changed JS files, complete
  tracked release-content scan, version/lock parity, whitespace and no-new-long-dash checks passed.
- Self-review covered the actual GuildMemberAdd wiring and image/fallback paths. Prior News
  v1.58.1 remains included unchanged. Last verified production is v1.58.0, not this checkpoint.
  Next deployment should use the combined v1.58.2 commit, controlled Discord-only restart and
  private bot-commands acceptance after approval; do not redeploy the superseded v1.58.1 separately.
- Graph vocabulary selected welcome/onboarding/embed/event. Existing graph is historical and
  CLI is unavailable, so bounded traversal only oriented the search; current source/tests decide.
  No graph rebuild, dependency installation, new temporary spec/plan or unrelated cleanup.
- Subject: fix(welcome): Hengs Discord v1.58.2 - remove duplicate onboarding content.

The appreciation proposal above this checkpoint was implemented locally in v1.59.0. Persistent
member achievement history remains deferred and requires its own data/retention review.

## Hengs Discord v1.58.1 editor reliability checkpoint (not deployed)

- Henry approved the next priority: investigate intermittent Indonesian News fallback, not a new
  feature expansion. Current production stays v1.58.0 with the approved mixed 08:00 WIB schedule.
- Read-only cloud audit found one full NEWS_EDITOR_FALLBACK and zero partial fallbacks in the
  bounded recent journal window; configured primary is Groq GPT-OSS 120B. That old code does not
  retain a category, so the exact cause of the earlier fallback cannot be reconstructed.
- One baseline public-only probe completed STOP/valid JSON/2 accepted/budget not exhausted.
  The first operator invocation had a syntax error before any API call; fixed and syntax-checked.
  Do not claim token exhaustion, validator failure or outage was proven for the original incident.
- For exact Groq GPT-OSS 120B/20B only, strict nullable JSON schema, reasoning_effort=low,
  include_reasoning=false and max_completion_tokens=700. Other providers/models retain json_object
  and max_tokens=700. Same 8s deadline, zero retries, no rotation, spacing/cache/hourly cap unchanged.
  Local field/ID/language/length/number/content validation remains authoritative after schema output.
- Completion exceptions become typed fixed codes; editor permits only an explicit set in logs.
  Raw provider errors, body, reasoning, article text and private chat are never logged. Empty,
  incomplete, invalid JSON/schema, request/access/rate/timeout/provider failures now distinguishable.
- One candidate in-memory probe on the VM used the same two public excerpts and existing provider:
  STOP/valid JSON/2 accepted/budget not exhausted. No code installed, state write, service restart,
  public/private Discord message or retry. This proves one compatible sample, not future reliability.
- Read-only diagnosis/probes are ignored under .cloud/automation/news-editor-*-1581.sh. Private
  environment stayed in VM memory; no secret copied. No changes to WA/Canox/backup/Oracle/ACL.
- Full offline regression 631/631 passed on Node24. Focused editor/adapter tests passed; sandbox
  temp atomic-rename EPERM was resolved by the approved ordinary-temp offline run, not ACL edits.
  Review verified provider-specific parameter isolation, public-only input, fixed-code exception
  boundary, unchanged content validation and no persistent state/scheduler changes.
  Final documentation/content QA 9/9, six changed JS syntax checks, version/lock metadata,
  whitespace and no-new-long-dash checks passed. No obsolete temporary spec/plan created.
- Next gate: explicit deployment approval, controlled Discord-only restart preserving auth/state,
  then one private bot-commands preview. Do not reset receipts or force a public edition for testing.
- Subject: fix(news): Hengs Discord v1.58.1 - stabilize structured editorial responses and diagnostics.

## Hengs Discord v1.58.0 deployed and mixed daily edition activated

- Deployed exact source 69c196ca5ca9d0aabe82f5de553005ddd7108e9e on 2026-10-16 in one attempt.
  Candidate Node22 QA 627 total/624 pass/0 fail/3 expected checkout-only skips; local 627/627 covered
  those checks. Immutable dependencies reused. Two moving CONNECTED/OK/fresh heartbeats passed,
  one consumer, zero automatic restarts. Config/state preserved; staging absent, rollback 1.57.0
  retained. WA 0.46.0 and Canox memory-only 0.178.0 unchanged; private memory/backup timer intact.
- In bot-commands at 22:08 WIB, one fresh private preview selected Cloudflare + NVIDIA + xkcd,
  exactly 2 news/1 comic with source image links and distinct comic label. Both news briefs used
  explicit source-language fallback; Indonesian rewriting is NOT accepted by this sample.
  No retry, public send, generated image or false translation claim. Future focused work should
  diagnose the editor fallback without exposing provider responses or increasing retry/budget.
- Same private preview followed by `terapkan berita` succeeded. Persisted settings now tech/ai/
  memes, 08:00 WIB, count 3, casual, same tested channel, enabled=true. Independent audit confirmed
  the original one sent daily receipt and three seen hashes unchanged. No extra edition today.
- Next eligible scheduled window 2026-10-17 08:00 WIB. First automatic delivery remains unobserved;
  source availability may produce fewer items. Entertainment is xkcd comics, not a viral meme feed.
  No Codex scheduled check added. Preserve receipts and inspect when Henry returns.
- Private proof: .cloud/automation/news-v1580/news-mixed-enabled-2026-10-16.png.
  audit-news-mixed-enabled.sh is the current activation-day audit, not a perpetual daily check;
  audit-news-enabled.sh pins the superseded tech/ai setup. Deployment status ACCEPTED; do not
  redispatch. Local bots zero/autostart off. No QR, auth, backup, reboot or Oracle operations.
- Code checkpoint pushed to origin/main. GitHub reported zero check runs/statuses, so no CI-green
  claim; acceptance is based on offline local QA, isolated Linux QA and observed production health.
- Documentation QA 9/9 passed, including tracked secret/content scan; metadata, whitespace and
  no-new-long-dash checks passed. No new temporary spec/plan or unrelated cleanup was needed.
- Documentation subject: docs(news): Hengs Discord v1.58.0 - record deployment and mixed daily activation.

## Hengs Discord v1.58.0 implementation acceptance

- Henry approved one coherent News refinement batch followed by one deployment. Scope is Discord
  News only; WA/Canox, auth, private state, backup, Oracle and full agent runtime stay unchanged.
- `terapkan berita` requires fresh private preview, current manager/destination permissions and
  matching revision. Only a tested same-channel destination may preserve enabled/paused state;
  fresh/changed channels retain first-send gate. Apply dispatches nothing, preserves day receipts
  and seen hashes, rejects an active delivery and invalidates stale scheduler work. Schema1 unchanged.
- `atur berita 2 berita 1 meme` correctly retains selected news topics (tech/ai fallback), adds
  comics and count3. Mixed count>=2 reserves one entertainment slot; no stale/duplicate/type filler.
  News first, comics last with distinct label/accent, actual counts and shortage explanation.
- Fixed Cloudflare tech feed added. Read-only production-transport probe passed public DNS/size/
  deadline/XML: 8 eligible articles,8 excerpts,7 allowlisted images; no model or Discord calls.
- Editor excludes empty-excerpt comic slots from public-only input and remaps dense IDs. Cache
  can reuse identical article briefs across mixes; no invented comic descriptions. Honest fallback
  remains when provider/copy validation fails; live Indonesian quality is not guaranteed by tests.
- Local full offline regression627/627,0fail on Node24. Initial sandbox EPERM on temp rename was
  isolated with baseline tests; approved unsandboxed offline suite passed without ACL changes.
  Existing 47 focused tests passed before the final concurrency/permission/atomic-write additions.
- Code/data-flow review: no private model inputs, arbitrary feed URLs, new credentials or schema;
  daily receipts cannot be reset by revise. Existing same-channel live state needs no migration.
- Controlled deployment and mixed activation completed above. No extra public edition sent.
  Rollback target is v1.57.0-3b9458f179b0.
- Code subject: feat(news): Hengs Discord v1.58.0 - refine revisions and balanced daily editions.
  Internal architecture/source evidence is in ignored NEWS-DIRECTION.md; no extra spec/plan.

## Hengs Discord v1.57.0 daily news activated

- Henry approved continuing from the accepted preview to daily activation. Fresh read-only audit
  passed on the unchanged v1.57.0 code3b9458f179b0: both bots healthy/single consumer, Canox memory
  private and healthy, zero automatic restarts, local bots zero/autostart off.
- In bot-commands, one fresh ephemeral `preview berita` completed, then `aktifkan berita` returned
  success at17:10WIB on2026-10-16. Settings preserved: tech/ai,08:00WIB,count3,casual,existing news
  channel. No send-once, save/reset, receipt reset, source expansion, restart, deploy or backup.
- Independent read-only audit confirms tested=true/enabled=true, same one sent receipt/three seen
  hashes and one public message. Member read-only permissions and no mentions remain unchanged.
  Scheduler is native in the Discord service; no Codex automation or local laptop dependency added.
- Next eligible scheduled window is2026-10-17 at08:00WIB. This is not proof of a successful future
  delivery: first automatic edition remains unobserved and no eligible fresh item means no post.
  Check the edition when Henry returns; do not create another scheduled Codex check by default.
- Pause using `/hengs ask` with `jeda berita`; inspect with `status berita`. Preserve receipts.
  Existing static channel topic still has the original setup wording; no channel edit was made.
- Private proof: .cloud/automation/news-v1570/news-daily-enabled-2026-10-16.png.
  audit-news-enabled.sh is the activation-day audit; it pins the original receipt count/date and
  is not a perpetual daily health check. audit-news.sh expects paused state and is now historical.
- Documentation QA9/9, tracked release-content/secret scan, version, whitespace and no-new-long-dash
  checks passed. No source/dependency change; production remains the same accepted code commit.
- Documentation subject: docs(news): Hengs Discord v1.57.0 - record daily news activation.

## Hengs Discord v1.57.0 controlled deployment and Indonesian preview accepted

- Henry approved deployment and private preview. Exact deployed source:
  3b9458f179b056fe1e571c659a9f914a426c0ecf. Source-only archive SHA256 verified at both ends.
- Fresh preflight passed: Node22, previous1.56.0, capacity, no concurrent deploy, healthy single
  consumers and news tested/paused. Isolated candidate QA ran before stopping old Discord:
  617total/614pass/0fail/3expected checkout-only skips, already covered by local617/617.
  Lock unchanged except release version; immutable existing dependencies reused.
- Controlled atomic switch passed two moving CONNECTED/OK/fresh heartbeats >=30seconds apart,
  active/enabled, one node matching MainPID and zero automatic restarts. Data fingerprints matched
  across the stopped switch, news file and config fingerprints unchanged. No auth/QR/restore,
  backup/reboot, slash registration or Oracle action. Staging absent; v1.56.0 retained for rollback.
- WA0.46.0 and Canox memory-only0.178.0 kept their PIDs/releases/environment, healthy without
  restart. Private memory capability separation/loopback-only listener and backup timer verified.
  Local bot processes zero, local autostart off. Full Canox runtime/watcher remain out of scope.
- One actual /hengs ask preview berita in bot-commands returned an ephemeral image-first card,
  Indonesian title/summary, AI-from-snippets disclaimer, original source link/date and Only you
  can see this. One fresh unseen NVIDIA article selected; no stale/duplicate-publisher filler.
  This proves one live editor/visual sample, not general factual correctness or multiple-source
  availability. No second preview/provider retry, public send or daily enable action requested.
- Existing public edition remains one message with its three original links, no mentions;
  channel remains member read-only under BOT CENTER. News schema1, tested=true/enabled=false,
  one sent receipt on2026-10-16 and three seen hashes retained.
- Private proof: .cloud/automation/news-v1570/news-indonesian-preview-2026-10-16.png.
  Operators in the same ignored folder. Deployment status ACCEPTED, do not redispatch.
  v1570 audit is current; v1560 version-pinned audit is historical after this upgrade.
- Post-preview independent health/state/public-message audit passed. Documentation checkpoint
  QA9/9, full tracked release-content scan, metadata/whitespace/no-new-long-dash checks passed.
- Next: Henry reviews the private preview. Daily activation needs explicit approval; do not
  publish another edition or reset receipts merely to test. Future tests stay in bot-commands.
- Documentation subject: docs(cloud): Hengs Discord v1.57.0 - record deployment and editorial acceptance.

## Hengs Discord v1.57.0 Indonesian news briefs and publisher diversity, local checkpoint

- Henry approved the local batch: concise Indonesian title/summary and more balanced publishers.
  At most one fresh unseen item per configured publisher, newest first within selected topics.
  Default technology/AI now yields at most2items, possibly1/0; no stale or duplicate-source filler.
- Bounded editor uses existing configured Groq primary, or first existing OpenRouter free model
  only when Groq is absent. One request per batch, max700tokens,8second abort deadline, no SDK
  retries/tools/model rotation. Only public title/excerpt/positionalID/tone sent, no chat, memory,
  guild/user identity, URL, image or private data. Global per-process1inflight/30second spacing/
  12attempts per rolling hour, resets on restart and is not a persistent billing cap.
- Exact JSON shape/IDs and text/length/language/new-number checks reject invalid output. Valid
  siblings survive an empty excerpt/invalid sibling. These checks do not guarantee semantic
  correctness; cards label AI from snippets, retain source/image/date and fall back honestly.
- Preview/send reuse exact copy without regeneration. Reset/pause/revision/shutdown and
  freshness are rechecked after editing. Cache successes/failures in bounded RAM10min/60batches;
  schema1/state/backup unchanged, no new dependency, source, database or service.
- Verification: full offline617/617,0fail/skip on Node24.15.0. Focused news40/40 before two final
  regression additions. Mock provider verifies exact SDK options and isolation from private chat;
  preview/send parity, fallback, budgets, source diversity, persistence exclusion and races pass.
  Initial sandbox EPERM on atomic temp rename resolved by identical offline checks outside sandbox,
  without weakening file permissions or storage implementation. Review fix wave added freshness
  recheck after await and per-item fallback for empty excerpts; final full regression passed.
  Final focused59/59,12JS syntax checks,17file release-content/secret scan, whitespace and no new
  long dashes passed. Synthetic fixture field renamed to avoid a credential-pattern false positive;
  scanner unchanged. No tracked GitHub Actions workflow; no CI-green claim.
- Local only: no provider/feed request, bot start, cloud write/deploy/restart, Discord publication,
  daily activation, WA/Canox/Oracle or backup action. Cloud remains v1.56.0 d823153d7c5a, news paused.
  Next gate: separately approved deployment with Node22 QA and bounded real editorial preview in
  bot-commands; do not repeat the old public edition or activate the daily schedule implicitly.
- Prior UI change: existing hengs-news grouped under BOT CENTER with Keep Current Permissions.
  Future supervised tests belong in bot-commands, with private previews where available.
- Canonical local design: docs/NEWS-DIRECTION.md. No new temporary spec/plan; unrelated historic
  operational contracts retained. Graphify CLI/NetworkX unavailable and graph predates news;
  inspection used current source and tests, no dependency installation or graph rebuild.
- Commit subject: feat(news): Hengs Discord v1.57.0 - add Indonesian briefs and publisher diversity.

## Hengs Discord v1.56.0 controlled deployment and native visual preview accepted

- Henry approved continuing deployment and private preview. Exact deployed source is
  d823153d7c5ac6fe3d4da728581e0389c3b2d9e8 (includes the packaging correction below).
- Read-only capacity/current-release/single-consumer/news-paused preflight passed. Source-only
  archive checksum verified at both ends. Candidate QA ran isolated on Linux Node22 before
  stopping the old bot:604total/601pass/0fail/3expected checkout-only skips, covered locally
  by17/17. No dependency changes; immutable existing dependency tree reused after lock comparison.
- Controlled switch accepted after two moving CONNECTED/OK/fresh heartbeats >=30seconds apart,
  one process matching systemd MainPID, active/enabled and zero automatic restarts. Persistent
  data fingerprints matched across the stopped switch. News file fingerprint remained unchanged.
  Environment/config fingerprints unchanged; no QR/auth/restore/backup/reboot or slash registration.
- WA0.46.0 and Canox memory-only0.178.0 stayed healthy with unchanged PIDs/releases/environment.
  Memory capability separation, loopback listener and backup timer independently verified.
  Staging cleaned; v1.55.0 remains immutable rollback. Local bot processes0/autostartoff.
- Actual owner /hengs ask preview berita returned private Components V2 with3image cards and
  source links. Browser screenshot verified a publisher image above its title/excerpt/source/date
  and the Only you can see this label. Proof image stays ignored in news-v1560, no auth data.
- Existing public edition left unchanged; independent official REST audit verifies one message,
  three original item links, no mentions and read-only member channel. News remains schema1,
  tested=true/enabled=false, one sent receipt on2026-10-16. No send-once or enable action repeated.
- Next: Henry reviews visual/source-language content; daily activation requires separate approval.
  Source diversity and Indonesian summaries remain follow-up options, not implemented.
- Private operators: .cloud/automation/news-v1560. Deployment status ACCEPTED; do not redispatch.
  audit-news.sh is current; news-v1550 pins old production and is historical after this upgrade.
- Documentation subject: docs(cloud): Hengs Discord v1.56.0 - record deployment and visual acceptance.

## Hengs Discord v1.56.0 packaging correction before approved deployment

- Henry approved continuing deployment/private visual preview. Read-only preflight passed;
  production remains v1.55.0 with news paused, no cloud write yet.
- The actual archive builder rejected v1.56.0 because its independent RELEASE_VERSION was
  still1.55.0. Builder now reads package.json and still compares committed HEAD metadata after
  its clean-checkout gate. Fixture expectations use the real checkpoint version so a future
  stale builder pin fails QA. Build-only change, no product version bump or runtime behavior.
- Subject: build(release): Hengs Discord v1.56.0 - bind archive version to checkpoint metadata.
- Focused packaging/news checks39/39 passed, whitespace/content policy passed. Actual committed
  archive creation remains required before transfer; never bypass VERSION_INVALID.

## Hengs Discord v1.56.0 image-first news cards, local checkpoint

- Henry requested a visual image above the explanation and source after reviewing the actual
  text edition. Added native Discord Components V2 cards, max3 in one message. Preview uses the
  same renderer with its instructions as TextDisplay; no content/embeds mixed with the V2 flag.
- Fixed feed entries may provide one HTTPS raster image from per-publisher host/path allowlists.
  Media RSS/enclosure/HTML/escaped Atom supported. URL is checked again at presentation; no
  arbitrary URLs, SVG, query redirects/signed URLs, byte downloads or article-page crawling.
  Discord loads publisher image previews. Missing/rejected images retain readable text/source.
- No model, new dependency, state migration, credentials, private data or new service. Existing
  schema1/daily claim/nonce/permissions/pause/rollback behavior retained. URLs/content RAM-only.
- Source domains/paths verified from four existing public feeds read-only with TLS enabled on
  2026-10-16. Discord component contract checked against official reference. No images fetched.
- Cloud remains v1.55.0, one test edition already sent today, enabled=false/tested=true. Do not
  resend or enable automatically. Actual native visual acceptance still needs an approved
  deployment and private preview. No deploy/restart/production state change in this checkpoint.
- Verification: full offline suite604/604, zero failures/skips on local Node24.15.0; focused
  news/visual tests30/30 passed. Syntax, whitespace, native component builder/SDK serialization
  and layout detector passed. Actual public NVIDIA feed:8recent items/8image URLs parsed,
  renderer bounded to3cards; zero image downloads/Discord sends. Security review confirmed
  exact media origin/path bounds, no new fetch sink or persistence, sanitized text/no mentions,
  same private preview/send checks and unchanged durable delivery claims. Initial
  sandbox-only EPERM on temp rename was resolved by the same offline suite outside sandbox,
  not by changing atomic writes. New visual parser/renderer tests passed in sandbox as well.
- Commit subject: feat(news): Hengs Discord v1.56.0 - add image-first news cards.

## Hengs Discord v1.55.0 live news dogfood accepted, daily schedule paused

- Henry approved continuing the news-only setup and one supervised test edition. After Henry
  signed in privately, the actual owner Discord UI ran /admin setup, Yes, preview, then
  Tambah news saja. One read-only hengs-news text channel was created; full legacy setup was
  not invoked. No channel deletion, rename, template migration or webhook creation requested.
- Actual ephemeral /hengs ask drafted technology + AI, 08:00 WIB, max3, casual. Private content
  preview succeeded, then exactly one kirim berita sekali was sent. Bot acknowledged success
  with schedule paused. The real channel visibly contained one bot embed with three articles.
- Independent official REST read-only audit confirmed one matching text channel, default member
  send/thread denies, one bot message with three item links, no user or everyone mentions.
  Production schema1 validated: one guild, enabled=false, tested=true, one sent receipt dated
  2026-10-16, three hashes/seen entries. No direct state edits or bypassed confirmation flow.
- DC1.55.0, WA0.46.0 and Canox memory0.178.0 remained healthy/single-consumer, zero automatic
  restarts; private memory/backup timer intact and local bots zero/autostart off. No deploy,
  service restart, auth/QR change, secret transfer, backup run, Oracle or Canox runtime action.
- Current post-dogfood read-only checks: .cloud/automation/news-v1550/audit-news.sh and
  inspect-news-result.sh. Older audit.sh expects an absent news file and is historical.
  Proof screenshot remains private/ignored; no runtime identifiers/content copied into Git.
- Live content caveat: all three available selected items came from NVIDIA Blog and excerpts
  remain source-language English. This is not an AI summary/translation. Owner review is still
  needed before daily activation; source variety and Indonesian summaries are proposed follow-up,
  not implemented or approved. Do not send another test edition on the same local day.
- Dogfood evidence incorporated into the subsequent v1.56.0 news checkpoint.

## Hengs Discord v1.55.0 controlled deployment accepted

- Henry approved the proposed Discord-only deployment on 2026-10-14. Exact deployed source:
  057f8d82f25b85c3ed391d830806a3575604b921 / v1.55.0. Documentation HEAD may advance.
- Immutable source archive checksum matched locally and remotely. Candidate passed Linux Node22
  QA before the old bot was stopped: 596 tests, 593 pass, zero fail, exactly three checkout-only
  skips. All three skipped cases passed in the local focused suite, 17/17 with zero skips.
- Controlled restart accepted on two moving CONNECTED/OK/fresh heartbeats at least 30 seconds
  apart, active/enabled, exactly one process matching MainPID, zero automatic restarts.
  No rollback needed; immutable v1.54.0 remains available. Persistent-state fingerprints matched
  across the stopped pointer switch; environment/config fingerprints were unchanged.
- WA v0.46.0 and Canox memory-only v0.178.0 stayed healthy with unchanged PIDs, release pointers
  and environment. Separate private memory capabilities and loopback-only listener verified.
  Existing memory backup timer unchanged; no backup run, store transfer, QR, auth change,
  VM reboot, local bot start, Canox restart, Oracle watcher or resource action.
- Independent final read-only audit passed after acceptance: local consumers zero/autostart off,
  staging absent, rollback available, news-state.json absent. No command registration, actual
  news channel creation, edition delivery or daily schedule activation occurred.
- At deployment acceptance, owner setup/preview/send dogfood was pending. It subsequently
  passed on 2026-10-16 above. Daily activation still awaits owner review of the first edition.
- Private operators: .cloud/automation/news-v1550. Do not redispatch the completed one-shot job;
  audit.sh was the deployment read-only check, superseded after news dogfood above.
  No tracked Actions workflow; no CI-green claim.
  No new spec/plan or archive added; existing unrelated active contracts retained.
- Documentation subject: docs(cloud): Hengs Discord v1.55.0 - record verified optional news deployment.

## Hengs Discord v1.55.0 optional admin news setup (implementation)

- Henry requested an optional news question in /admin setup. The home-guild admin command now
  asks yes/not-now/cancel, presents a private preview, then requires an explicit action.
- News-only creates a single ordinary read-only text channel without running unrelated legacy
  setup. Full setup remains a separate button, disclosing its existing rename/move/stat replacement
  and webhook behavior. No re-registration needed: slash command schema remains unchanged.
- A uniquely named existing hengs-news is reused with name/parent/permissions preserved. Duplicate,
  wrong-type, foreign-guild or insufficient-permission target stops. Declining does not delete a
  channel or disable any existing news configuration. New standalone channel is at guild root;
  full setup places a new one under ANNOUNCEMENTS. Public /setup behavior is unchanged.
- RAM tickets max100/TTL10min, random IDs, actor/guild/channel/revision binding, fresh inventory fingerprint,
  manager/bot permission rechecks, one apply per guild and consumption before external write.
  Reopening setup invalidates even an old confirmation awaiting acknowledgement. No application
  retry/destructive rollback after uncertain creation; re-inventory before any manual new attempt.
- Does not change news enabled/tested/settings, fetch feeds, send an edition, create persistent
  state, call providers, access memory, start local bots, or modify WA/Canox/cloud.
- Full final local regression596/596 passed on Node24.15 after the sandbox's temp-file rename EPERM was
  reproduced and the unchanged offline suite ran outside that filesystem restriction. Final
  session-identity and old-button revision fixes also passed all25 focused admin-setup tests. No product persistence
  or permission guard was weakened to make tests pass. Syntax/diff/release boundary checked.
- At implementation completion production was Discord1.54.0, WA0.46.0, Canox memory-only0.178.0.
  Separately authorized v1.55.0 Node22 deployment subsequently passed above; private /admin setup dogfood remains.
  A real channel or first news send must still follow the owner's chosen preview/confirmation.
- Main files: src/guilds/admin-setup.js, src/commands/admin.js, src/index.js,
  test/admin-setup-news.test.js. Canonical contract: docs/NEWS-DIRECTION.md; public guide README.md.
  No new standalone spec/plan or archive created; unrelated legacy contract documents retained.
- Commit subject: feat(setup): Hengs Discord v1.55.0 - add optional news channel onboarding.

## Hengs Discord v1.54.0 controlled deployment accepted

- Henry explicitly approved deployment on 2026-10-13. Exact deployed source:
  1dbbb3c5a6ea130160803161d845834c77241d4d / v1.54.0. Documentation HEAD may advance.
- Immutable candidate passed Linux Node22 QA before stopping Discord: 571 tests, 568 pass,
  zero fail, exactly three skips requiring Git metadata or the adjacent local WA checkout.
  All three skipped cases passed in the laptop focused suite, 17/17 with zero skips.
- Accepted active/enabled on two moving CONNECTED/OK/fresh heartbeats at least 30 seconds
  apart, one process matching MainPID, zero automatic restarts. No rollback was needed.
  v1.53.0 remains the immutable rollback release. State fingerprints matched across the
  stopped pointer switch; secrets/config fingerprints matched before and after deployment.
- WA v0.46.0 and Canox memory-only v0.178.0 stayed healthy with unchanged PIDs, release pointers
  and environment files. Memory remains enabled with separate private capabilities; no Canox
  restart, notebook transfer, backup run, QR, token/auth reset, VM reboot or Oracle action.
- News is installed but UNCONFIGURED: news-state.json absent before and after acceptance.
  No real news message, channel creation, command registration or daily schedule activation.
  Local bots zero/autostart off; remote staging absent; existing memory backup timer unchanged.
- Next: manager private preview through /hengs ask, then explicitly approved one-shot delivery
  and daily activation. Live news delivery/user dogfood is pending, not part of this acceptance.
- Scoped private operators: .cloud/automation/news-v1540. Do not redispatch the one-shot job.
  Code archive SHA-256 was verified locally and remotely. No CI-green claim: prior GitHub
  snapshot had no check runs/statuses and the repository has no tracked Actions workflow.
- Documentation subject: docs(cloud): Hengs Discord v1.54.0 - record verified news deployment.

## Hengs Discord v1.54.0 - Hengs News implementation

- Henry approved the coherent news batch: topic/time/style configuration, revisable private preview,
  and one daily digest. Implemented through existing /hengs ask; no command registration required.
- Default technology + AI, 08:00 WIB, up to3items; gaming and entertainment/comic presets optional.
  Existing same-guild text channel required. No channel creation, model generation, media download,
  private conversation/memory access, paid API, provider registration, or custom source URL.
- Configure/preview/save-paused/send-once/enable/pause/status are guild-owner/Administrator only.
  Activation requires a successful one-shot send of the same settings. Fresh preview bound to
  actor/guild/channel/revision/TTL, reset cancellation and revalidation of manager/channel permission.
- Fixed HTTPS feeds with public-DNS guard, no redirects, timeout and byte caps. RSS/Atom/RDF text
  sanitized; no source instruction execution. Source-language title/excerpt/date/link, not LLM news.
- Native bot timer, per-guild/day durable claim, stable Discord nonce, no automatic retry of an
  ambiguous send, no missed-day backlog and no empty digest. Crash can lose one digest rather than
  duplicate it; exactly-once delivery is not claimed. State schema1 is atomic and bounded, separate
  from old schemas. Existing snapshot/restore selector includes and validates news-state.json.
- Source read-only probe: four feeds parsed; technology zero fresh items, AI3, gaming1, comic1 at
  probe time. No real Discord message, cloud deployment, bot local start, QR, token/auth change,
  cloud backup, Oracle watcher or Canox runtime change.
- Verification: full final local regression571/571, focused integration58/58, zero failures/skips.
  Syntax11changedJS files, whitespace, release/secret boundary and zero added long dashes passed.
  Local runtime Node24.15;
  production Node22 archive/VM acceptance subsequently passed above; real Discord news send pending.
  Four public feed probes passed; synthetic tests cover claims/restarts/permissions/reset/races,
  corruption, atomic failure, source boundaries, bounded parsing, snapshot inclusion and privacy.
- Production now runs accepted v1.54.0 Discord and v0.46.0 WA with memory-only Canox v0.178.0.
  News is available but unconfigured. Do one private preview/supervised delivery before explicitly
  enabling a guild's daily schedule.
- Canonical internal feature architecture: docs/NEWS-DIRECTION.md. Public setup: README.md.
  Existing specs/plans reviewed; no news duplicates or archival copies created.
- Commit subject: feat(news): Hengs Discord v1.54.0 - add configurable daily news digests.

## Hengs Discord v1.53.0 controlled deployment accepted

- Henry explicitly approved deploying this batch before enabling private shared memory.
  Exact deployed code f3161f6de8997ea71484f35b9f8fad558f6933df / v1.53.0; previous accepted
  v1.42.0 retained for rollback. Current checkout may advance by this documentation commit.
- Linux Node 22 candidate suite: 549 total, 546 pass, zero failures, exactly three skips needing
  Git metadata or the adjacent laptop WA checkout. Local focused suite 17/17, zero skips,
  covers these absent-checkout cases. No functional tests were suppressed or product code changed.
- Candidate dependencies rebuilt from committed lock when the live pruned lock was nonidentical.
  Installed with lifecycle scripts disabled; full candidate suite passed before stopping the bot.
  Initial preparation/QA gate failures did not change the active bot or lose persistent state.
- New release accepted on two moving CONNECTED/OK/fresh heartbeats, active/enabled, one process,
  zero automatic restarts. WA was unchanged during code deployment and remains v0.46.0.
- Subsequently enabled approved Canox v0.178.0 memory-only integration via separate private
  capability and controlled bot restart; token, state and unrelated settings preserved.
  Actual client revision/list/recall passed as service user. Memory only admitted for exact owner,
  home guild and private replies. No public memory access or automatic harvesting/training.
- New canonical memory started empty, no desktop notebook copied. Encrypted initial backup and
  private resource-bounded service accepted. Detailed operations/backup limits/rollback remain
  in the ignored Canox handoff. Human create/recall dogfood and long-uptime acceptance pending.
- No slash-command registration, automatic channel/role creation, QR, bot local launch, VM reboot,
  Oracle watcher/resource action or real provider-generation test. Staging/transfer cleaned.
- Next candidate: configurable hengs-news; design only, no publishing/channel/schedule activation.
- Documentation checkpoint subject: docs(cloud): Hengs Discord v1.53.0 - record deployment and memory activation.

## Hengs Discord v1.53.0 3D Card Bevel Polish

- Local-only checkpoint. No cloud deployment, command registration, token, QR, Canox, or cloud
  Discord mutation was performed.
- Avatar, onboarding badge, dan panel statistik mendapat bevel statis dengan bayangan offset,
  highlight tepi, serta shading bawah avatar. Efek tetap deterministik dan dikirim sebagai PNG.
- Tidak ada perubahan copy, onboarding flow, state, schema, provider call, atau permission.
  Motion tetap ditunda agar jalur pengiriman tetap ringan.
- Release metadata is synchronized to v1.53.0. Cloud remains held at the accepted production
  version until the requested batch deployment.
- Focused card, onboarding, public welcome, runtime copy, release, and visual detector checks are
  required before commit. Push remains subject to the existing local GitHub DNS transport blocker.

## Hengs Discord v1.52.0 3D Welcome and Leave Cards

- Local-only checkpoint. No cloud deployment, command registration, token, QR, Canox, or cloud
  Discord mutation was performed.
- Welcome dan Leave Card kini memakai tiga layer depth deterministik di canvas: lantai perspektif,
  pantulan kaca pada panel identitas, dan highlight orb. Output tetap satu PNG statis sehingga
  ukuran, latency, dan jalur pengiriman tidak berubah menjadi pipeline animasi.
- Badge onboarding aman untuk display name yang berbeda dari username. Copy card dipadatkan menjadi
  satu baris saat handle display tampil agar tidak menabrak badge atau panel statistik.
- Motion sengaja ditunda. Tidak ada state baru, schema, provider call, atau aset eksternal.
- Release metadata is synchronized to v1.52.0. Cloud remains held at the accepted production
  version until the requested batch deployment.
- Focused card, onboarding, public welcome, runtime copy, release, and visual detector checks are
  required before commit. Push remains subject to the existing local GitHub DNS transport blocker.

## Hengs Discord v1.51.0 Welcome Card and Onboarding Refresh

- Local-only checkpoint. No cloud deployment, command registration, token, QR, Canox, or cloud
  Discord mutation was performed.
- Welcome Card v2 now carries approved custom copy inside the image, a fixed `START HERE` badge,
  clearer embed title and footer, and structured onboarding fields for rules, roles, intro, and
  announcements. Public guild onboarding gets a short setup sequence as well.
- Onboarding is generated from current channel references at send time. No onboarding completion
  state, public configuration field, or new schema is introduced. Mentions remain disabled.
- Release metadata is synchronized to v1.51.0. Cloud remains held at the accepted production
  version until the requested batch deployment.
- Focused card, onboarding, public welcome, runtime copy, and release checks are required before
  commit. Push remains subject to the existing local GitHub DNS transport blocker.

## Hengs Discord v1.50.0 Community Builder Themes

- Local-only checkpoint. No cloud deployment, command registration, token, QR, Canox, or cloud
  Discord mutation was performed.
- Community Builder now carries one of three fixed preview themes, Aurora neon, Midnight gelap, or
  Minimal bersih, plus bounded text coverage and voice count choices through the private text plan,
  visual card, review ticket, and Apply gate.
- Text coverage is full, essential, or none. Voice count is zero through the available template
  slots, prioritizing selected area voices before the lobby. Choices are validated in memory and do
  not change channel creation safety, existing-name matching, welcome state, public guild
  configuration, or persistent schema.
- Release metadata is synchronized to v1.50.0. Cloud remains held at the accepted production
  version until a separate deploy approval.
- Focused prompt, preview, review, command, community, and release checks are required before
  commit. Push remains subject to the existing local GitHub DNS transport blocker.

## Hengs Discord v1.49.0 Welcome Copy Controls

- Local-only checkpoint. No cloud deployment, command registration, token, QR, Canox, or cloud
  Discord mutation was performed.
- Owner or Administrator can privately use `/hengs ask` to set, inspect, or clear the home welcome
  copy. Set reuses the bounded normalizer and atomic writer. Clear validates the regular state file
  before unlinking it, rejects symlinks or malformed state, and restores the fixed welcome copy.
- Direct mentions and non-home guilds cannot expose or mutate the custom copy. No AI provider call
  occurs for these actions.
- Release metadata is synchronized to v1.49.0. Cloud remains held at the accepted production
  version until a separate deploy approval.
- Focused welcome, prompt, command, home state, and release checks are required before commit.
- Push remains subject to the existing local GitHub DNS transport blocker. Deployment is separate.

## Hengs Discord v1.48.0 Persistent Welcome Copy

- Local-only checkpoint. No cloud deployment, command registration, token, QR, Canox, or cloud
  Discord mutation was performed.
- The owner-confirmed welcome draft is now stored atomically in the home welcome state file after
  the one-time Apply message succeeds. Later home-guild member joins reuse that bounded copy in
  the existing welcome card. Missing or invalid state falls back to the previous fixed copy.
- State is scoped to the configured home guild, limited to 180 characters, rejects mentions, URLs,
  controls, and bidi characters, and is never sent as an allowed mention. Existing channel, role,
  permission, and card behavior remains unchanged outside the description copy.
- Release metadata is synchronized to v1.48.0. Cloud remains held at the accepted production
  version until a separate deploy approval.
- Focused welcome, prompt, apply, review, community, onboarding, command, and release tests pass
  81/81. The integrated suite reaches 537/539 with one known Windows sandbox symlink fixture
  failure and one skipped host-limited case. Syntax, whitespace, long-dash, secret, and release
  checks pass for the changed scope.
- Checkpoint committed locally with subject
  `feat(community-revision): Hengs Discord v1.48.0 - persist bounded welcome copy`. Push is
  currently blocked by the local GitHub DNS transport error. Deployment remains a separate
  explicit action.

## Hengs Discord v1.47.0 Applyable Welcome Copy

- Local-only checkpoint. No cloud deployment, command registration, token, state, Canox, or cloud
  Discord mutation was performed.
- A bounded `welcomeCopy` now travels through the private text and visual preview, review ticket,
  and owner Apply call. On Apply, Hengs posts it once to the lobby welcome channel with mentions
  disabled. It never edits or deletes an existing message.
- The target must be an existing or newly created lobby welcome text channel and must expose View
  Channel plus Send Messages. If delivery fails, the fixed result closes the ticket without an
  automatic retry and explains that the welcome message was not sent.
- Channel creation remains create-only. Existing categories and channels are not renamed, moved,
  deleted, or permission-mutated. No persistent schema or provider integration was added.
- Release metadata is synchronized to v1.47.0. The cloud release remains held at the previously
  accepted production version until a separate deploy approval.
- Focused prompt, apply, preview, and review tests pass 30/30. The integrated suite reaches
  534/536 with one known Windows sandbox limitation: `cloud-state-transfer.test.js` cannot create
  its symlink fixture. One test is skipped for the same host limitation. Syntax, whitespace,
  long-dash, secret, and release checks pass for the changed scope.
- Checkpoint committed locally with subject
  `feat(community-revision): Hengs Discord v1.47.0 - apply bounded welcome copy`. Push is
  currently blocked by the local GitHub DNS transport error. Deployment remains a separate
  explicit action.

## Hengs Discord v1.46.0 Custom Community Revision

- Local-only checkpoint. No cloud deployment, command registration, token, state, Canox, or
  Discord runtime mutation was performed.
- Community planning now accepts a bounded revision layer in RAM: `opsi 1` through `opsi 4`,
  quoted `nama lama` jadi `nama baru` pairs for known categories and channels, and an optional
  welcome copy draft. The parser normalizes Discord-safe labels, rejects mentions, URLs,
  permission terms, destructive verbs, and oversized input, and keeps unknown labels as a clear
  warning instead of guessing.
- The revision travels through the private text preview, visual card, review ticket, and apply
  operation. Apply still creates only missing categories and channels. Existing categories and
  channels are matched through base, emoji, and requested-name aliases; a requested new label is
  used only when its old slot is absent. Nothing is renamed, moved, deleted, or
  permission-mutated. Welcome copy is preview-only and is not persisted or activated by this
  checkpoint.
- Option mapping is explicit: 1 lobby, 2 server core, 3 area gaming, 4 creator studio. The
  32-operation cap, owner confirmation, Manage Channels gate, inventory fingerprint, guild lock,
  and no-retry-on-failure remain unchanged.
- Release metadata is synchronized to v1.46.0, including the local archive builder and Linux
  release validator. Cloud remains at the previously accepted production version until a
  separate deploy approval.
- Targeted prompt, apply, preview, and review tests pass 28/28. Full Node regression passes
  534/534, with syntax, whitespace, long-dash, secret, and release checks also passing.
- Checkpoint committed as `eeb54b9` with subject
  `feat(community-revision): Hengs Discord v1.46.0 - add bounded prompt revisions` and pushed
  to `main`. Deployment remains a separate explicit action.

## Hengs Discord v1.45.0 Community Layout and Welcome refresh

- Local-only checkpoint. No cloud deployment, command registration, token, state, Canox, or
  Discord runtime mutation was performed.
- Prompt-first community planning now carries a bounded `nameStyle`: `plain` by default, or
  `emoji` when the owner asks for icons, emoji, or an aesthetic layout. The private text and
  visual preview use the same style so the review matches the eventual apply operation.
- Community blueprints now include reference-style category names. Applying a confirmed plan
  creates missing categories first, then creates missing text and voice channels inside them.
  Existing channels are recognized through plain and emoji aliases. Nothing is renamed, moved,
  deleted, or permission-mutated. Inventory fingerprints include category and parent metadata,
  so drift closes the ticket before apply.
- The creation cap is 32 operations to account for up to four categories plus their bounded
  channels. Owner confirmation, Manage Channels gate, guild lock, and no-retry-on-failure remain.
- Welcome and leave copy is more conversational while keeping targeted welcome mentions and no
  leave mentions. Card rendering, account age, join date, member count, and tenure behavior stay
  intact. No persistent welcome-style schema was added.
- Targeted suite: 36/36 passed. Node syntax checks passed for all changed modules. Full suite,
  whitespace, long-dash, secret, and release checks remain before the automatic checkpoint.
- Next: run the full Node suite, inspect the diff, commit `feat(community-layout): Hengs Discord
  v1.45.0 - add configurable channel layouts and warmer welcome copy`, and push `main` if all
  gates pass. Deployment remains a separate explicit action.

## Hengs Discord v1.44.0 selective memory local checkpoint

- Henry approved the shared selective-memory design/plan. Implemented default-off memory only
  for exact configured owner + home guild + ephemeral /hengs ask, not other admins or public chat.
  Explicit new entries have preview/correction/confirmation and scoped list/edit/disable/trash.
- Dedicated capability cannot read general Canox notes/UI or provider controls. DC keeps its
  existing generation provider and project bridge. Ordinary local notes/reminders are unchanged.
  No automatic chat harvesting/training, replica, scheduler, embeddings or database was added.
- Approved bounded recall is data, not authority. ETag change/unavailability/reset clears private
  RAM, pending/receipts and stale leases; final revision recheck prevents outdated delivery. Stable
  per-conversation serial distinguishes evicted/reset records. Memory API latency is deferred
  privately before await, uncertain writes never retry or fall back to local notes.
- Full Node 22.23.3 regression 529/529, zero skip, serial mode; actual command tests prove owner/
  guild/private scope and no calls for public/other actors. Release metadata/escaped pins align
  to 1.44.0; scanner false positives were fixed by correct non-secret variable names, not weaker
  rules. Moderation code/tests untouched. No real bot, provider, registration or cloud operation.
- Canox v0.168.0 passed 1,083 tests with three existing skips; WA v0.43.0 318/318. Required Python
  review findings resolved, including bounded withdrawal beyond the read cap and Windows signal-
  free liveness reuse. Shared canonical contract is WA docs/architecture/SELECTIVE_MEMORY.md.
- No production state/schema read or migration, secret transfer, QR, backup or service change.
  Cloud remains last accepted v1.42.0, not freshly audited. Deploy and memory activation held.
- Commit subject: feat(memory): Hengs Discord v1.44.0 - add private owner memory through Canox.
  Next: exact-scope commit/push and inspect CI; operator endpoint/credentials/migration/live
  acceptance remain a separate gate, not authorization inferred from older deployment messages.

## Hengs Discord v1.43.0 connected conversation local checkpoint

- Henry approved package 1 of the shared assistant batch, with deployment still explicitly held.
  Implementation stays on active main; no worktree, cloud write, bot process, provider call,
  token/state migration, command registration or Canox mutation occurred.
- Added isolated bounded RAM context: private 64 entries/48k chars, shared 24/24k; six-hour logical
  idle expiry on next access. Requests select recent complete exchanges plus older lexical matches
  within private 24/16k and shared 16/10k. No embeddings, new provider call or durable memory.
  Max 300 guild/user records; reset/eviction/expiry guards reject late provider/feature reinsertion.
- Fixed actual command wiring: ordinary "ada lagi?" reaches chat instead of a personal menu;
  caller-scoped five-minute time/confirmation continuations reach the existing personal handler.
  Topics clear pending state; reset clears pending too, not durable notes/reminders. Explicit
  prefix/strict-delete parsing rejects discussion, negation and quoted commands as writes.
- Private personal/focus/status replies project allowlisted family/status receipts only after
  delivery. Note save/preview exposes SAVED/FAILED/PENDING_CONFIRMATION; RESPONDED is not success.
  No note/reminder contents, lists, contacts, IDs or paths cross the feature-to-LLM boundary.
  A result awaited across reset suppresses its stale body and truthfully says reset is not undo.
  Other guilds/users and shared chat cannot read these private receipts. Existing role gates remain.
- Prompt tone follows recent context/corrections, permits optional light humor, avoids generic
  menus and unverified activity/action/learning claims. Removed stale semester claim from home
  identity. Formatting is preserved, long dashes removed, raw chat provider errors no longer logged.
  Humanizer guided wording; this is prompt policy, not proof of every live model response.
- Offline regression fixtures first reproduced routing/version faults. Integrated Node 22.23.3
  suite ultimately passed 520/520, 0 skip, in serial mode with isolated workspace state/TEMP/TMP
  under approved local execution. Default sandbox later denied atomic rename/hard-link fixtures
  and timed out isolated Python in the sibling WA suite; this was not fixed by weakening code or
  host security. Approved read-only syntax/privacy checks passed (12 JS, 1 shell, LF, whitespace,
  added-long-dash and tracked-content policy). New command schedule fixture has a fixed clock.
- One parallel full run left the pre-existing moderation panel retry test failing at its fixed
  80 ms sleep. Full serial run passed with moderation code/test untouched. Do not claim default
  parallel CI or live model dogfood passed. No external CI settings/retries were changed.
- Version/lock/release guards and public privacy contract synchronized to 1.43.0. Internal
  docs/ASSISTANT-CONTEXT.md is ignored; existing tracked internal docs were not untracked or deleted.
  No new temporary spec/plan/archive. Current accepted cloud remains v1.42.0 code 4d11891.
- Commit subject: feat(assistant): Hengs Discord v1.43.0 - connect private feature follow-ups and bounded context.
  Next: commit/push/build a clean-HEAD local archive, keep deploy held. Long-term approved knowledge
  and richer task edits remain the next separately scoped design/implementation work, not completed.

## Proposed shared assistant batch and deployment hold - 2026-10-08

- Henry deferred new deployments and asked to accumulate coherent WA/DC assistant improvements.
  Discord checkpoint remains 1.42.0/cbba9c6 (accepted deployed code 4d11891); checkout clean.
  Current agent.js still retains ten message entries per private/shared surface, so longer bounded
  context is a concrete improvement candidate. Existing notes/reminders/project drafts are not new
  feature gaps. Preserve guild/user and private/shared boundaries and reset-generation guards.
- Proposed only, not implementation approval: connected conversational intent/context plus friendly
  grounded tone; selective owner-approved Canox knowledge under a separate architecture/privacy gate;
  contextual correction/editing of existing notes/reminders. No automatic private-to-public recall.
- graphify snapshot is dated 2026-08-13 and cannot establish October behavior. Its configured Python
  no longer imports graphify; a read-only inline traversal was used as a historical locator, while
  current source/handoff provided the verified planning facts. No graph rebuild/install or provider
  calls were made. No token/state/command registration, service change or deployment occurred.
- Next: agree the bounded batch, verify locally, then obtain new production authority for a shared
  maintenance window with independent acceptance/rollback for each bot. Batching reduces restart
  frequency; it does not replace QA or guarantee bug-free live behavior.

## Assistant Response Experience v1.42.0 - 2026-10-04

- Local checkpoint `1.42.0` menambahkan progress message fixed untuk `/hengs ask` dan typing indicator
  bounded yang diperbarui setiap delapan detik selama mention AI masih berjalan. Keduanya menghentikan
  timer setelah hasil atau error, tanpa menulis state baru atau mengirim isi prompt ke log.
- System prompt home dan public lebih tegas tentang identitas Hengs, larangan mengklaim tindakan Henry,
  dan perilaku klarifikasi untuk pertanyaan lanjutan. Konteks privat/public v1.41.0 tetap dipertahankan.
- Test terarah lulus `28/28` dan suite penuh lulus `509/509`. Cloud sekarang v1.42.0 active/enabled
  setelah restart terkontrol dan dua heartbeat `CONNECTED/OK/fresh`; satu MainPID Node menjadi consumer
  Discord, staging bersih, dan proses Discord lokal tetap nol.
- Archive dari commit `4d11891` ditransfer lewat peer privat, diverifikasi checksum, diuji oleh deployer,
  lalu pointer release dipindahkan secara atomik. Token, auth, state persisten, VM, registrasi command,
  dan WhatsApp tidak disentuh.
- Next action: dogfooding live tiga jalur, yaitu `/hengs ask` privat, mention publik, lalu `/hengs reset`.
  Rollback v1.41.0 tetap tersedia.

## Private and Shared Conversation Isolation v1.41.0 - 2026-10-03

- Local checkpoint `1.41.0` memisahkan history `/hengs ask` privat dari mention publik untuk setiap guild
  dan user. Keduanya tetap RAM-only, bounded maksimal 10 pesan per surface, dan tidak memakai database,
  schema, provider, token, auth, atau state persisten baru.
- `/hengs reset` menghapus kedua surface hanya untuk caller terkait. Jawaban provider yang selesai setelah
  reset tidak boleh masuk kembali ke percakapan aktif, dan cooldown tetap berlaku lintas surface.
- Suite terarah lulus `33/33` dan suite penuh lulus `506/506`. Cloud sekarang v1.41.0 active/enabled
  setelah restart terkontrol dan dua heartbeat `CONNECTED/OK/fresh`; satu MainPID Node menjadi consumer
  Discord, staging bersih, dan proses Discord lokal tetap nol.
- Archive dibangun dari commit `bf85952`, ditransfer lewat peer privat, diverifikasi checksum, diuji oleh
  deployer, lalu pointer release dipindahkan secara atomik. Token, auth, state persisten, VM, registrasi
  command, dan WhatsApp tidak disentuh.
- Next action: dogfooding tiga jalur secara read-only dari sisi produk: `/hengs ask` privat, mention publik,
  lalu `/hengs reset`. Rollback v1.40.0 tetap tersedia.

## Private Discord Assistant v1.40.0 - 2026-10-03

- Local checkpoint `1.40.0` memperbaiki visibilitas `/hengs ask` di home guild. Balasan AI percakapan
  biasa sekarang selalu ephemeral, sementara routing catatan, reminder, focus, Ops Hub, dan Event Hub
  tetap memakai jalur fixed-code yang sudah ada.
- History tetap RAM-only, bounded maksimal 10 pesan per guild dan user, serta tetap dihapus oleh
  `/hengs reset`. Tidak ada database, schema, provider, token, auth, atau kontrak Canox baru.
- Test terarah ditambahkan untuk memastikan home AI privat, public AI tetap public, dan identitas prompt
  memakai Hengs. Cloud sudah v1.40.0 active/enabled setelah restart terkontrol; v1.39.1 tetap tersedia
  sebagai rollback.
- Suite lokal penuh lulus `501/501`, `git diff --check`, syntax check, dan scan long dash pada
  perubahan.

## Cloud Deployment v1.40.0 - 2026-10-03

- Archive dari commit `f734f6f` ditransfer melalui peer privat, checksum diverifikasi, lalu deployer
  menjalankan dependency install, full test, prune, dan perpindahan pointer `current` secara atomik.
- Service Hengs Discord di-restart terkontrol tanpa mengubah token, auth, state persisten, VM, atau
  command registration. Dua heartbeat berjarak minimal 30 detik lulus `CONNECTED/OK/fresh`.
- Acceptance akhir menunjukkan service active/enabled, satu MainPID Node, nol proses Discord lokal, dan
  seluruh staging transfer sudah dibersihkan. v1.39.1 tetap menjadi rollback release.

## Cloud Cutover and Canox Dogfood - 2026-10-03

- Release `1.39.1-f0927b259cc1` is active/enabled as the single cloud Discord consumer after two
  bounded `CONNECTED/OK/fresh` heartbeats. The cloud main PID is nonzero and the local Discord
  process count is zero.
- Canox generated one sanitized `kind=project` payload. Hengs consumed it into a private pending
  Ops draft with the Canox external id. The inbox and processing files were removed, no failed
  payload remained, and no publish action occurred.
- No token, auth, persistent state migration, command registration, reboot, or unrelated service
  change was performed. The v1.37.0 release remains available for rollback.

## Cloud Staging v1.39.1 - 2026-10-03

- Release `1.39.1-f0927b259cc1` is installed on the VM and the immutable `current` pointer was
  switched atomically after archive, checksum, dependency, and VM-side test validation.
- The Discord service is intentionally `inactive/disabled` with main PID zero. No token, auth,
  persistent state, command registration, reboot, or production cutover was performed.
- Remote archive, checksum, deploy script, and temporary logs were removed after verification.
  Local release storage retains only the active rollback archive v1.37.0 and the staged v1.39.1
  archive.
- Next action: perform a separate activation and two-heartbeat acceptance only after explicit
  cutover approval.

## Deployment Gate Fix - 2026-10-03

- Local checkpoint is v1.39.1. The Linux deployer and release metadata now validate the
  current immutable release instead of the stale v1.37.0 gate.
- This patch changes only release validation and packaging metadata. It does not change the
  Canox inbox contract, service activation, token, auth, or persistent state.
- Full QA must pass before transferring the archive. Cloud remains v1.37.0 active/enabled until
  a controlled maintenance window is explicitly completed.

## Canox Project Handoff - 2026-10-03

- Local checkpoint is v1.39.0. The existing Canox Ops inbox now accepts an allowlisted `kind`
  value for project cards while keeping announcement payloads compatible.
- Canox validates and writes the atomic file; Discord consumes it into the existing private
  `bot-settings` review panel. No new network path, provider secret, chat history, or automatic
  publish was added.
- Unknown kinds are treated as announcements on the Discord consumer boundary. Project cards keep
  the owner review, schedule, publish, and discard controls already used by Ops Hub.
- Focused bridge and consumer tests pass. Cloud deployment remains intentionally pending.

## Canox Bridge Status and Project Drafts - 2026-10-03

- Local checkpoint is v1.38.0. Prompt-first Discord now recognizes explicit project task phrases,
  such as `Buat tugas proyek landing page: rapikan hero dan cek mobile`.
- The result is a private project draft in the existing Ops Hub. It keeps the existing review,
  owner approval, schedule, publish, and discard boundary. It never creates a channel or publishes
  automatically.
- Ops state stores a bounded `kind` field (`announcement` or `project`); older state without the
  field remains compatible. Provider fallback still produces a truthful local draft if the editor
  is unavailable.
- Canox v0.155.0 now exposes a separate read-only local bridge status contract. Discord does not
  open a new network path to Canox in this checkpoint; cloud deployment is intentionally pending.
- Focused prompt, Ops store, assistant, syntax, and Canox bridge API checks pass. No cloud restart,
  command registration, token, auth, or production state change occurred.

## Private Personal Assistant - 2026-10-03

- Local checkpoint is v1.37.0. `/hengs ask` now supports private owner notes and one-shot reminders
  with deterministic Indonesian prompts. Notes require preview confirmation; reminders ask for a
  missing time and are delivered once by DM.
- Personal state is bounded and atomically replaced in ignored `data/personal-memory-state.json`,
  scoped by guild and user. Pending confirmations stay in memory for five minutes and are never
  written to disk.
- Only the home guild owner or an Administrator can use this path. Mentions, ordinary members, and
  public guilds receive a fixed privacy response without a state write. Existing Event Hub reminders
  remain separate.
- Focused personal, store, prompt, and command tests pass. The committed release was deployed as
  v1.37.0-f62be05af4a1. Cloud service is active/enabled with two fresh `CONNECTED/OK` heartbeats,
  one valid systemd main process, and zero local Discord consumers.
- Remote release staging and transfer files were cleaned after acceptance. The previous cloud release
  remains available for rollback. No token, auth, WA, VM reboot, or command registration changed;
  the slash-command schema is unchanged. Live personal dogfooding is still pending.
- Checkpoint subject: `feat(personal-assistant): Hengs Discord v1.37.0 - add private natural notes and reminders`.

## Natural Operation Status - 2026-10-02

- Local checkpoint is v1.36.0. Owner or editor Ops Hub can ask `lihat status draft`, `cek status
  event`, or equivalent wording for a private, bounded count summary.
- The route reads existing Ops Hub and Event Hub status only. It does not expose draft content,
  create state, publish, schedule, or add a new store, command schema, queue, or scheduler.
- Focused prompt operation, prompt assistant, and command tests pass. Cloud remains v1.35.0;
  no deployment, restart, command registration, or live operation mutation occurred in this slice.

## Natural Operation Drafts - 2026-10-02

- Local checkpoint is v1.35.0. Owner or configured Ops editor can use a natural prompt to create a
  private announcement or project update draft in the existing Ops Hub, or an event and reminder
  draft in the existing Event Hub.
- Event prompts require an explicit WIB time in `HH:mm` or `YYYY-MM-DD HH:mm`. Relative wording such
  as "besok" is held for clarification instead of guessed. The parser is bounded and provider-free.
- The adapter adds no scheduler, database, queue, or command schema. Existing private panels remain
  the only review boundary. Ops publish, schedule, discard, Event publish, and Event discard keep
  their existing authorization rules.
- Full local suite passes 487/487. Cloud production is now v1.35.0 with two advancing
  `CONNECTED`/`OK`/fresh heartbeats, one active cloud process, zero local Discord processes, and
  enabled autostart. The immutable v1.28.0 release remains available for rollback. No token,
  auth, WhatsApp, VM reboot, command registration, or live prompt dogfooding changed during deploy.
- Remote release staging was cleaned after acceptance. Remote dependency audit still reports one
  high advisory and was not auto-fixed during this deploy.
- Checkpoint subject: `feat(prompt-assistant): Hengs Discord v1.35.0 - add natural operation drafts`.

## Text-and-Visual Community Preview - 2026-10-02

- Local checkpoint is v1.34.0. Generic prompts still ask bounded questions, while specific prompts
  produce a private text tree before any action.
- Review tickets now offer an optional PNG card generated by the existing Canvas runtime. The card
  shows fixed text and voice channels with existing or suggested markers and no raw identifiers.
- The owner still gets a separate confirmation and apply step. The executor can create only missing
  fixed text and voice channels, at most 24 per ticket. It cannot rename, delete, move, create
  categories, change roles or permissions, send messages, or accept arbitrary names.
- Prompt-card, review, apply, and cloud-release tests pass. Cloud remains v1.28.0. No deployment,
  restart, command registration, or live Discord mutation occurred.
- Commit: 5c73f0d feat(prompt-assistant): Hengs Discord v1.34.0 - add text and visual community preview.

## Natural Focus Prompts - 2026-10-01

- Local checkpoint is v1.31.0. Owner or Administrator can say `fokus belajar`, `mulai scrim`,
  `status mode`, or `selesai fokus` in the home guild. The action uses the existing in-memory
  state behind `/study` and `/scrim`.
- Questions, negation, schedules, durations, and ambiguous multiple modes remain non-mutating.
  Public scope stays on the ordinary AI path. No Discord API mutation, provider call, persistence,
  token, or deployment was added. Cloud remains v1.28.0.
- Focus prompt tests pass. Next action is local dogfooding in the home guild before any deployment
  approval.

## Prompt reprioritization - 2026-09-30

- Henry explicitly reprioritized Hengs Discord toward prompt-first usage after reviewing the server
  layout screenshot. The local checkpoint is v1.30.0. Cloud remains v1.28.0 until a separate deploy
  approval.
- Mention Hengs and `/hengs ask` now recognize provider-free help prompts and safe community-plan
  prompts. `/hengs ask` can issue a private five-minute preview ticket with review, cancel, and
  owner confirmation buttons. A home-guild owner or Administrator can receive a read-only blueprint
  for lobby, core, gaming, and creator sections. No Discord mutation is performed.
- Ordinary prompts still use the existing AI path, public traffic guard, history, and privacy rules.
  The next possible slice is a private draft-apply preview with owner confirmation. Do not implement
  direct channel or permission mutation from free text.
- The canonical public invite is generated by `src/create-public-invite.js` and requests only View
  Channel, Send Messages, Read Message History, Attach Files, bot, and application-command scope.
  The public README now carries the generated link so Henry does not need to reconstruct it.
- `main` is synchronized with `origin/main`; the older GitHub credential blocker note is resolved.
  Discord remains live and monitored while this local prompt checkpoint awaits deployment approval.

## Current local checkpoint: v1.30.0 - Prompt Review Assistant

- `src/prompt-assistant.js` contains the bounded classifier and fixed community blueprint. `src/prompt-review.js`
  adds RAM-only, five-minute review tickets with fingerprint and owner checks. It has no provider
  call, persistent state, queue, scheduler, or arbitrary Discord API action.
- Focused routing and prompt-review tests pass 26/26. Cloud deployment and slash-command registration are
  intentionally pending explicit approval.

## Current production checkpoint: v1.28.0 - Control Center Settings

- The active `/setup dashboard` now opens one private Settings panel for fixed reply style,
  language, chat channel, Community Pack channel, all-channel scope, and Community Pack off.
- Style and language use existing enums. Both channel inputs accept exactly one Discord-selected
  text or announcement channel from the current guild and never accept typed IDs or names.
- Chat selection requires View Channel, Send Messages, and Read Message History. Community Pack
  selection separately requires View Channel, Send Messages, and Attach Files.
- Every interaction rechecks fresh public scope plus owner or Administrator access, then calls only
  one existing atomic schema 4 setter. Invalid, stale, forged, cross-guild, or incomplete inputs
  leave configuration unchanged without fallback or partial preset application.
- Settings add no schema, stored session, member data, content, secret, public message, or AI call.
  The global command schema is unchanged from v1.27.0.
- Immutable v1.28.0 is cloud production and the sole Discord token consumer. Two advancing
  `CONNECTED`/`OK`/fresh heartbeats passed with exactly one Discord process, zero restart count,
  zero local bot processes, and clean release staging. State and Anti-Raid configuration persisted.
- One valid command registration completed after service health acceptance. Read-only audit confirms
  two global commands, 12 home-guild commands, and `/setup dashboard` in the exact global schema.
- WhatsApp remained active/enabled as one cloud process. No WA restart, auth change, QR, VM reboot,
  local bot start, public-guild activation, or setup-state mutation occurred.
- Focused Settings, routing, and release verification passes 56/56. The complete local suite passes
  456/456, syntax checks pass for 115 JavaScript files and four Linux shell scripts, production
  dependency audit reports 0 vulnerability, and runtime source contains no em dash or en dash.
- Commit `21c5bdd` has subject `feat(discord): Hengs Discord v1.28.0 - add control center settings`.
  The production record commit is `b52c492`; both are synchronized with `origin/main`.

## Previous local checkpoint: v1.27.0 - Community Control Center

- `/setup dashboard` opens an ephemeral panel for pending and active public guilds. It summarizes
  fixed setup state, existing seven-day aggregate usage, trend, and read-time configuration health.
- Active panels expose exact Refresh, Select Channel Again, Preview Welcome, Open Insights, and
  Disable Hengs buttons. Pending panels expose only Start Setup and Refresh.
- Every component rechecks fresh guild scope plus owner or Administrator authorization. Repair
  reuses the v1.26.0 Discord picker and writes nothing until a valid selection is submitted.
- Preview and Insights stay ephemeral. The panel stores no session, identifier, preference, chat,
  member data, or new schema field, and it never calls an AI provider.
- `/setup disable` and the dashboard disable button now share a two-step confirmation. Confirm
  purges aggregate insights before deleting the exact guild config; purge failure preserves config.
- The `/setup` global schema adds one `dashboard` subcommand. A later combined v1.26.0 and v1.27.0
  deployment requires exactly one authorized command registration after service health acceptance.
- Focused Control Center, routing, and release verification passes 50/50. The complete local suite
  passes 449/449, syntax checks pass for 115 JavaScript files and four Linux shell scripts,
  production dependency audit reports 0 vulnerability, and runtime source contains no em dash or
  en dash.
- v1.25.0 remains cloud production. No Discord write, registration, deployment, restart, or cloud
  mutation occurred.
- Commit `13a91e3` is pushed to `origin/main` with subject
  `feat(discord): Hengs Discord v1.27.0 - add community control center`.

## Previous local checkpoint: v1.26.0 - Guided Setup and Owner Insights Phase 3

- `/setup start` is now read-only until the authorized owner or Administrator selects exactly one
  existing text or announcement channel from Discord's private channel picker.
- One successful selection applies Hengs Standard in one atomic schema 4 write: balanced style,
  automatic language, current-channel scope, and Community Pack enabled in the same channel.
  The preset does not read or copy home-guild settings, IDs, roles, channels, prompts, history, or
  member data.
- Component completion rechecks the fresh guild scope, actor permission, active-guild capacity,
  selected-channel ownership and type, plus View Channel, Send Messages, Read Message History, and
  Attach Files before mutation. Reapplying the exact preset is idempotent.
- Owner Insights Phase 3 compares the latest seven UTC days with the preceding seven days and
  reports a fixed new, up, down, or steady trend. It also checks configured channels and permissions
  at read time. No new field is written to config or schema 1 insight state.
- Focused verification passes 64/64 and the complete suite passes 438/438 on local Node 24.15.0.
  Syntax checks pass for 113 JavaScript files and four Linux shell scripts, production dependency
  audit reports 0 vulnerability, and runtime source contains no em dash or en dash. Version and
  immutable deployment metadata are aligned to v1.26.0.
- v1.25.0 remains cloud production. No deployment, command registration, service restart, Discord
  write, public-guild activation, or cloud mutation occurred.
- Commit `967ac10` is pushed to `origin/main` with subject
  `feat(discord): Hengs Discord v1.26.0 - add guided setup and owner trends`.

## Previous production checkpoint: v1.25.0 - Community Pack and Owner Insights Phase 2

- Commit `181fc2e` is pushed to `origin/main`. Immutable v1.25.0 is cloud production and remains
  the only Discord token consumer. Discord local and WhatsApp local both remain at zero processes.
- Public owners and Administrators can use `/setup welcome` to preview the existing Aurora card
  privately, enable member welcome and leave cards in the current channel, or disable them.
- Community Pack is opt-in for every new and migrated guild. It requires View Channel, Send
  Messages, and Attach Files, attempts one exact-channel send, and has no channel fallback.
- Public member events do not run the home server's auto-role, stats, moderation, links, or private
  welcome wording. The home server behavior remains unchanged.
- Guild config schema 4 stores only `welcomeEnabled` and `welcomeChannelId` beside the existing
  fixed settings. Schemas 1 through 3 remain readable and default the feature to disabled.
- Owner Insights Phase 2 calculates active days, average usage, busiest aggregate day, feedback
  coverage, helpful rate, and fixed recommendations from the existing schema 1 counters. No new
  content, identity, channel, or provider data is persisted.
- Local Node 24.15.0 verification passes 429/429. Syntax passes for 111 JavaScript files and four
  Linux shell files, whitespace checks pass, the production dependency audit reports
  zero vulnerabilities, and runtime source contains no em dash or en dash. Release metadata keeps
  exact Node 22 as the deployment requirement.
- Security review confirms targeted mentions only on welcome, no mentions on leave or preview,
  strict member and channel identifiers, exact permission checks, no fallback channel, atomic
  schema migration, and no new sensitive insight data.
- Deployment used the committed immutable archive and preserved persistent state. Two advancing
  `CONNECTED`/`OK`/fresh heartbeats passed with exactly one Discord process and zero service
  restarts. Tailscale remained online and release staging plus transfer residue were clean.
- Command registration ran exactly once after health acceptance. Read-only audit confirms two
  global commands, 12 home-guild commands, and `/setup welcome` with the exact `enable`, `disable`,
  and `preview` actions. Read-only server verification reports success.
- WhatsApp remained v0.20.3 active/enabled, `CONNECTED`/`OK`/fresh, and exactly one process. No WA
  restart, QR, auth change, VM reboot, local bot start, public guild activation, or Community Pack
  enablement occurred.
- Checkpoint subject: `feat(discord): Hengs Discord v1.25.0 - add community welcome controls and richer insights`.

## Previous production checkpoint: v1.24.0 - Layered Welcome Cards

- Commit `8f8ffa4` and the preceding v1.22.0 and v1.23.0 checkpoints are pushed to `origin/main`.
  Immutable v1.24.0 was the previous cloud production release and sole Discord token consumer.
- Welcome and leave cards now use a generated Aurora Gateway background beneath deterministic
  Canvas layers. The production asset is 900 x 280 and under 512 KiB. The high-resolution ImageGen
  master is retained in `assets/_originals/` for future visual work.
- Short membership tenure now keeps minute and hour precision. An eight-minute stay renders as
  `8m` instead of `0d`; missing join data renders as `Unknown` instead of inventing a timestamp.
- The welcome message no longer uses an em dash. All remaining em dash and en dash characters were
  removed from runtime source, including legacy command copy, prompts, logs, and comments. A global
  regression test enforces that boundary.
- Focused visual, runtime-copy, and release tests pass 29/29. The full suite passes 421/421 on
  local Node 24.15.0. All 109 JavaScript files and four Linux shell scripts pass syntax checks,
  the production dependency audit reports 0 vulnerabilities, and whitespace checks pass. Visual
  inspection confirms readable welcome and leave compositions at 900 x 280. Both PNG assets have
  no textual or EXIF metadata. Humanizer review and the global source test confirm zero em dash or
  en dash characters in runtime code.
- Cloud deployment used exact Node 22.23.2. Archive acceptance ran 421 tests with 418 pass, three
  intentional repository or workspace skips, and zero failures. The release pointer changed
  atomically while Discord was stopped, then two advancing `CONNECTED`/`OK`/fresh heartbeats passed
  with one process and zero systemd restarts. The v1.19.1 release remains available for rollback.
- Command registration reached Discord exactly once after health acceptance. Read-only API audit
  confirms `/setup` and `/hengs` as the two global commands and 12 home-guild commands matching the
  committed schema. Read-only server verification reports zero failures and zero warnings.
- WhatsApp remained v0.20.3 active/enabled, `CONNECTED`/`OK`/fresh, and exactly one process throughout.
  No QR, auth change, WA restart, VM reboot, state restore, public guild activation, or local bot
  start occurred. Remote transfer, deploy logs, command-audit helpers, and release staging were
  removed after acceptance.
- Anti-Raid is configured `active` in the preserved production state and has no mode-change audit.
  Deployment did not mutate it. This supersedes the older handoff assumption that it was still
  configured `monitor`.
- Checkpoint commit subject: `feat(discord): Hengs Discord v1.24.0 - upgrade layered welcome cards`.

## Previous local checkpoint: v1.23.0 - Owner Insights

- v1.19.1 remains cloud production and the only Discord token consumer. No deployment, command
  registration, restart, invite installation, or public guild activation is authorized by this
  local checkpoint.
- `/setup insights` gives only the public guild owner or an Administrator a private 7-day or
  30-day aggregate. It reports accepted requests, temporary and daily limits, helpful or
  needs-work feedback, and current UTC daily-budget usage.
- Public mention chat and `/hengs ask` now claim a persistent daily budget before any AI provider
  call. The default is 100 accepted requests per UTC day and the operator override is restricted
  to 10 through 300. A store failure or exhausted budget releases the traffic lease and blocks
  provider work.
- Every successful public AI response has requester-only `Membantu` and `Kurang pas` buttons.
  Random issued request IDs make forged and duplicate feedback fail closed. Accepted feedback
  removes the buttons and receives a private acknowledgement.
- Per-guild schema 1 state retains at most 31 UTC days of integer aggregates and random request
  IDs. It stores no prompts, answers, usernames, display names, user IDs, channel data, topics,
  sentiment, or raw provider errors. Paths are tenant-bound, symlinks are rejected, writes are
  atomic, and unknown or corrupt state blocks only that public guild.
- `/setup disable` purges Owner Insights before deleting guild configuration. If the privacy purge
  fails, Hengs stays active and does not claim that all data was removed.
- Focused Owner Insights and routing tests pass 48/48. The full suite passes 417/417 on local Node
  24.15.0, all 109 JavaScript files and four Linux shell scripts pass syntax validation, the
  production dependency audit reports 0 vulnerabilities, and whitespace plus tracked release
  content checks pass. Humanizer review confirms the new user copy contains no em dash or en dash.
  Manual security review confirms provider admission ordering, tenant-bound strict state,
  aggregate-to-claim integrity, forged component denial, owner or Administrator reads, fixed-code
  failures, and fail-closed privacy purge. Node 22 is not installed locally, so exact Node 22
  acceptance remains a mandatory deployment gate.
- No deployment, command registration, restart, invite installation, public guild activation, or
  cloud write occurred in this checkpoint.
- Checkpoint commit subject: `feat(discord): Hengs Discord v1.23.0 - add privacy-safe owner insights`.

## Previous local checkpoint: v1.22.0 - Public Onboarding and Trust

- v1.19.1 remains cloud production and the only Discord token consumer. No deployment, command
  registration, restart, invite installation, or public guild activation is authorized by this
  local checkpoint.
- `/hengs invite` turns the existing least-privilege Discord OAuth URL into a private self-service
  command. Any member can open it, while Discord only lets them select a server they can manage.
  The URL is built from a validated application ID, fixed Discord domain, fixed scopes, and the
  existing View Channel, Send Messages, and Read Message History permissions. It contains no token.
- `/hengs privacy` gives a fixed, plain-language explanation before setup or AI access. It states
  that prompts go to an AI provider, chat history is not written to a file, in-process memory is
  capped at 10 recent messages per user and server, caller-only reset is available, and server
  configuration can be removed through `/setup disable`.
- `/hengs help` now provides a short member and manager path, and the one-time public welcome points
  to the privacy explanation. Invite and privacy do not read guild configuration, mutate state, or
  call an AI provider. Every response is private and mention-safe. Unexpected `/hengs` or `/setup`
  failures now log only one fixed outer error code instead of a raw exception.
- There is no persistence or config-schema change. A later authorized release still requires exact
  Node 22 acceptance, cloud deployment while preserving the single token consumer, and one global
  command registration because the `/hengs` schema changed.
- Focused command, onboarding, invite, and release tests pass 24/24. The full suite passes 397/397
  on local Node 24.15.0, all 105 JavaScript files and four shell scripts pass syntax validation,
  the production dependency audit reports 0 vulnerabilities, and whitespace plus release-content
  checks pass. Manual security review confirms fixed-domain invite construction, exact minimum
  permissions, token exclusion, private mention-safe responses, state-independent information
  commands, caller-only reset, and fixed-code public failures. Exact Node 22 acceptance remains a
  mandatory deployment gate.
- No deployment, command registration, restart, invite installation, public guild activation, or
  cloud write occurred in this checkpoint.
- Checkpoint commit subject: `feat(discord): Hengs Discord v1.22.0 - improve public onboarding`.

## Previous local checkpoint: v1.21.0 - Public Server Essentials

- v1.19.1 remains cloud production and the only Discord token consumer. No deployment, command
  registration, restart, invite installation, or public guild activation is authorized by this
  local checkpoint.
- `/hengs ask`, `/hengs reset`, and `/hengs help` provide public AI chat, caller-only in-memory
  history reset, and fixed onboarding guidance. The command is global beside `/setup`; all legacy
  commands remain home-guild only.
- `/setup language` exposes only Auto, Indonesian, and English. `/setup channel` accepts only all
  channels or the current interaction channel. `/setup status` reports style, language, and scope
  without exposing stored IDs.
- Mention chat and `/hengs ask` share the selected channel policy, one-active-request gate, and 30
  started requests per 10 minutes per public guild. Every AI response remains mention-safe.
- Schema 3 persists fixed style, language, and channel settings atomically. Schemas 1 and 2 stay
  readable and migrate on the next authorized write. Rollback to v1.20.0 fails closed for schema 3
  without deleting state, and forward repair is v1.21.0.
- Focused public server tests pass 43/43 and the full suite passes 393/393 on local Node 24.15.0.
  All 105 JavaScript files and four shell scripts pass syntax validation, the production dependency
  audit reports 0 vulnerabilities, and whitespace plus release-content checks pass. Security review
  confirms fixed-code errors, owner or Administrator settings, caller-only reset, prompt bounds,
  mention safety, channel isolation, and cross-guild state boundaries. Exact Node 22 acceptance
  remains mandatory before deployment.
- No deployment, command registration, restart, invite installation, public guild activation, or
  cloud write occurred in this checkpoint.

## Production checkpoint: v1.19.1 - Public Self-Service Beta Deployment Fix

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
  Henry committed and pushed v1.19.1 as `88e3ab1`.
- Immutable v1.19.1 is live on Oracle. Ubuntu install acceptance passed, two fresh connected
  heartbeats more than 30 seconds apart passed, service is active/enabled with exactly one process,
  persistent state is available, WhatsApp stayed active, and v1.18.0 remains available for rollback.
- Command registration ran exactly once after health acceptance. Read-only audit confirms one
  global command named `/setup`, 12 existing home-guild commands, and no `/setup` in the home scope.
  The Discord application permits public installation and does not require OAuth code grant.
- A least-privilege public invite was generated. No friend guild has been installed or activated
  yet, so cross-guild acceptance still needs one disposable or friend server.
- Release archives and the deployer were removed from the operator home directory after acceptance.
  No state restore, VM reboot, WhatsApp restart, local bot start, or Anti-Raid mode change occurred.

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
  success response was observed. A later authorized v1.19.1 registration replaced that historical
  baseline with one global `/setup` and the same 12 home commands.
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
