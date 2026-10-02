# Personal Assistant Contract

Status: Hengs Discord v1.37.0 is deployed in cloud production after controlled acceptance.
The personal state file remains empty until the owner uses the feature.

## Product contract

`/hengs ask` in the home guild accepts natural owner prompts for private notes and one-shot
reminders. Notes require a preview confirmation. A reminder without a time asks for the missing
time. Both actions use the existing fixed-code parser and never call the AI provider.

The personal path is owner or Administrator only and replies ephemeral. Mention-based prompts do
not write personal state because a normal Discord message is public. Existing Event Hub reminders
remain the public event workflow and are not merged with personal reminders.

## Architecture mapping

| Layer | Component | Boundary and invariant |
| --- | --- | --- |
| Infrastructure | Node process, existing instance lock | One scheduler process only |
| Data | `data/personal-memory-state.json` | Atomic JSON replace, bounded notes/reminders, ignored runtime data |
| Integration | Discord slash interaction and user DM | Ephemeral writes, DM only for the reminder owner |
| Application | `src/personal-assistant.js` | Deterministic parsing, pending confirmation, fixed replies |
| Experience | `/hengs ask` | Indonesian natural prompts, no public echo |
| Security | Home owner or Administrator gate | No public-guild or mention-based personal writes |
| IT Operations | 30-second worker and stale-sending recovery | At most three delivery attempts, fixed log codes |
| Semantic | Intent names and normalized WIB time | Only allowlisted fields reach the store |
| AI/ML | Existing `agent.chat` | Not used for notes or reminders |
| Agentic | Typed store actions | No arbitrary file, command, or channel selection |
| Enterprise orchestration | Canox and Ops/Event hubs | No new bridge or cross-hub state |

## Data contract

The state root is `{ version, nextNote, nextReminder, notes, reminders }`. A note contains
`id`, `scopeKey`, `text`, and `createdAt`. A reminder contains `id`, `scopeKey`, `guildId`,
`userId`, `text`, `dueAt`, `status`, `attempts`, `createdAt`, and `sendingAt`.

`scopeKey` is `guildId:userId`. The store never lists or deletes a record outside the caller's
scope. Notes are capped at 100 per file and 500 characters each. Reminders are capped at 100
per file and 300 characters each. Sent or failed reminders are retained for bounded recovery
history and are not shown as active.

## Flow and API contract

1. `resolvePrompt` recognizes a personal intent only for a private `/hengs ask` in the home guild.
2. `personalAssistant.handle(prompt, { guildId, userId })` reads or updates only the caller scope.
3. `catat ...` creates an in-memory preview. `oke catat`, `batal`, `ganti: ...`, and `catat mentah`
   resolve that pending action. Pending data expires after five minutes and is never persisted.
4. `ingatkan aku ...` parses a fixed WIB time. Missing time or text becomes a bounded follow-up.
5. The worker atomically claims one due reminder and sends a DM. Success marks it sent; failure
   retries at most twice with a fixed delay, then marks it failed.

## Authorization matrix

| Actor and surface | Personal read/write | Public Event Hub |
| --- | --- | --- |
| Home owner via `/hengs ask` | Allowed, ephemeral | Existing owner rules |
| Home Administrator via `/hengs ask` | Allowed, ephemeral | Existing owner rules |
| Other member or public guild | Denied, no state write | Existing public rules |
| Mention message | Denied for personal path | Existing mention path |

## Capacity and recovery

No database, queue, cache, load balancer, or new provider is required yet. The scheduler is a
single bounded interval and claims one item per tick, so concurrency is serialized by atomic
state replacement. Revisit a queue when active reminders exceed 100, delivery latency exceeds the
30-second tick, or more than one bot process is intentionally introduced.

The first schema is version 1 and has no migration. A malformed file fails closed and surfaces a
generic unavailable reply. Backup and restore reuse the existing encrypted Discord state policy;
the personal file must be included only after its privacy contract is reviewed. Rollback is a
code rollback with the file left untouched, so older releases must ignore the new file safely.
