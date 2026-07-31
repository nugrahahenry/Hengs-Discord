# Hengs Discord Bot — Handoff

Updated: 2026-07-31

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

## Current checkpoint

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
