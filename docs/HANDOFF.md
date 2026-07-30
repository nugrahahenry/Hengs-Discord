# Hengs Discord Bot — Handoff

Updated: 2026-07-30

## Current checkpoint

- Proposed version: **v1.1.1**
- Scope: correctness and security hardening for the existing owner-approved Ops Hub.
- Translation scope: **not implemented in this checkpoint**.
- Git publication: pending Henry review; Codex did not add, commit, push, deploy, or register slash commands.

## Version-history note

Repository HEAD before this audit was `5b7e604 Hengs Discord v1.1.0: Add private document translation`. The commit contents are actually Ops Hub (`src/ops/`, `/ops`) plus AI model changes; no document-translation service, slash command, or DeepL dependency exists in the tree. Because `v1.1.0` is already on `origin/main`, the safe next version is `v1.1.1`, not a downgrade to `v0.7.0`.

## Ops Hub contract

1. Discord owner runs `/ops draft`, or Canox atomically writes `data/canox-ops-inbox.json` with a unique `id` per draft.
2. Hengs creates a pending panel only in `BOT_SETTINGS_CHANNEL_ID`, with exact-name fallback limited to `🎛️・bot-settings` / `bot-settings`.
3. Only `OWNER_ID` can Publish or Discard.
4. Publish claims the draft synchronously before Discord network I/O. Concurrent clicks cannot both send.
5. Public embeds disable all mentions and include an internal Draft ID marker for crash recovery.
6. Existing 12-character draft IDs and new 16-character IDs are both accepted by approval buttons.
7. Single-instance lock mencegah launcher ganda menjalankan dua consumer/publisher.
8. Stale Canox `processing-*` files are recovered on startup; ambiguous extras are preserved as failed files instead of overwriting an active inbox.
9. Runtime files remain under ignored `data/`; no permanent external service receives draft state.

## Verification

- `node --check` passed for all 17 JavaScript source and test files.
- `node --test`: 7 tests passed, 0 failed.
- `npm audit --omit=dev` completed with Node system CA support: 4 known transitive `undici` findings remain (3 moderate, 1 high). npm reports no fix without changing the current dependency line; do not disable TLS or force a breaking Discord.js upgrade inside this checkpoint.
- Live Discord test is still pending because slash-command registration/deploy requires Henry's explicit permission.

## Local configuration state

- Present: `OWNER_ID`, `DISCORD_GUILD_ID`, `ANNOUNCE_CHANNEL_ID`.
- Missing at audit time: `BOT_SETTINGS_CHANNEL_ID`.
- Exact channel-name fallback should find `🎛️・bot-settings`, but filling the ID remains recommended.

## Manual acceptance after commit

1. Fill `BOT_SETTINGS_CHANNEL_ID` in `.env`.
2. Run `npm run deploy` only after explicit approval.
3. Restart the Discord bot.
4. Run `/ops draft`, double-click Publish rapidly, and verify exactly one public announcement appears.
5. Run `/ops status`, then verify Publish and Discard panels update correctly.
6. Test one Canox inbox payload written through temp-file + atomic rename.

## Next checkpoint

Private document translation may start only after this working tree is reviewed and committed. Before implementation, verify the actual DeepL account supports Document Translation and record its current file/size/format limits. Proposed next feature version from the current repository history: **v1.2.0**.

Suggested commit: `Hengs Discord v1.1.1: Harden owner-approved Ops Hub`
