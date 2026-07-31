# Hengs Discord Bot — Handoff

Updated: 2026-07-31

## Completed checkpoint

- Version: **v1.2.0**, committed as `e05c2b9`.
- Scope: restricted DeepL document translation for owner/allowlisted VIP.
- Live acceptance passed on 2026-07-31: a non-sensitive English TXT returned as an ephemeral Indonesian attachment; temp cleanup and bot health passed.

## Version-history note

Repository HEAD before this audit was `5b7e604 Hengs Discord v1.1.0: Add private document translation`. The commit contents are actually Ops Hub (`src/ops/`, `/ops`) plus AI model changes; no document-translation service, slash command, or DeepL dependency exists in the tree. Because `v1.1.0` is already on `origin/main`, the safe next version is `v1.1.1`, not a downgrade to `v0.7.0`.

## Ops Hub contract

1. Discord owner runs `/ops draft`, or Canox atomically writes `data/canox-ops-inbox.json` with a unique `id` per draft.
2. Hengs creates a pending panel only in `BOT_SETTINGS_CHANNEL_ID`, with exact-name fallback limited to `🎛️・bot-settings` / `bot-settings`.
3. Only `OWNER_ID` can Edit, Perpendek, Regenerate, Publish, or Discard.
4. AI revision claims `pending -> revising` before network I/O; Publish claims `pending -> publishing`. Concurrent actions cannot both proceed.
5. Public embeds disable all mentions and include an internal Draft ID marker for crash recovery.
6. Existing 12-character draft IDs and new 16-character IDs are both accepted by approval buttons.
7. Single-instance lock mencegah launcher ganda menjalankan dua consumer/publisher.
8. Stale Canox `processing-*` files are recovered on startup; ambiguous extras are preserved as failed files instead of overwriting an active inbox.
9. Runtime files remain under ignored `data/`; no permanent external service receives draft state.

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

- Proposed version: **v1.3.0**.
- Scope: Ops Hub revision workflow before owner approval.
- Pending panels expose five actions: Edit, Perpendek, Regenerate, Publish, and Discard.
- Edit uses a prefilled Discord modal; stale modal submissions fail closed if draft status changed.
- Perpendek and Regenerate use the existing Groq -> OpenRouter model chain with distinct fact-preserving prompts.
- Revision state is persisted as `revising`; Publish/Discard and concurrent revisions cannot claim the same draft.
- AI failure releases the revision claim and restores the original draft.
- Restart recovery returns interrupted revisions to pending and refreshes pending panels, covering a crash between state write and Discord panel update.
- Up to 20 previous title/body versions are retained in ignored local Ops state for audit.
- No slash-command schema changed, so v1.3.0 does not require `npm run deploy`.

## v1.3.0 verification

- `node --check`: all 21 source and test JavaScript files pass.
- `node --test`: 20 passed, 0 failed.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `git diff --check` and changed-file credential scan pass.
- Live Discord panel rendering passed: the private test draft shows Edit, Perpendek, Regenerate, Publish, and Discard in `bot-settings`.
- Live action acceptance passed: Regenerate and Perpendek both completed through Groq GPT-OSS 120B, two revisions were persisted, and the test draft was Discarded.
- Final state passed: zero pending/revising/publishing drafts, no publication was created, and Hengs remained online as one instance.
- Bot restarted cleanly as one instance with local v1.3.0 code; live acceptance is complete and the private test draft was discarded without sending a public announcement.

Checkpoint status: **ready for Henry's manual commit**.

Suggested commit after live acceptance: `Hengs Discord v1.3.0: Add owner draft revision workflow`
