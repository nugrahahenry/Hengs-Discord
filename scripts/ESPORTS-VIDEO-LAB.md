# Hengs esports video experiments

These are not an active YouTube watcher or a finished video extractor. None of these scripts is imported by the bot.
The original `esports-video-lab.js` makes **zero network requests**, loads no secrets, writes no runtime data,
and cannot publish to Discord. The separate supervised trial below can make one explicitly authorized request.
Product version remains unchanged: this checkpoint tests a candidate integration rather than shipping one.

Use Node 22 from the repository root:

```powershell
node scripts/esports-video-lab.js "https://www.youtube.com/live/8cDtD3-6Qrc"
node --test test/esports-video-lab.test.js
```

The CLI only canonicalizes a URL and reports `METADATA_REQUIRED` / `WAIT_FOR_VERIFIED_VOD`.
It does not discover the duration, fetch the video, run a model, or infer live status from its title.

The exported helpers accept explicit inputs for offline evaluation:

- `classifyVideo(video, policy)` takes a YouTube Data API video-shaped metadata fixture, freshness time and an
  operator-supplied channel-ID allowlist. Unknown, private, stale or conflicting metadata stops the plan.
- `planClip(input)` accepts only processed public VOD/archive metadata, exact video identity, and a valid interval
  no longer than 120 seconds. Its video-input descriptor is illustrative; it never invokes a provider.
- `inspectScoreboard(candidate)` checks game identity, timestamp, ten-player roster, kills/deaths, and rounded
  gold arithmetic. The reference gold rounding tolerance is specific to that scoreboard style. Every result is
  untrusted for Coach, including `CONSISTENT_CANDIDATE`. Arithmetic consistency is not image-reading accuracy.
- `REVIEW_PROMPT` separates observed facts, unknown fields, player/game clocks, and broadcast opinions. It is a
  extraction prompt, not a claim that prompt injection or hallucination is solved.

Tests use synthetic fixtures. They do not prove video access, automatic scene discovery, live ingestion,
OCR/vision accuracy, gameplay understanding, source-use rights, cost, or compatibility with all broadcasts.

## Offline scoreboard review cards

`scripts/esports-scoreboard-review.js` turns a local candidate into two PNG previews (1800x1240 and 900x1650),
an accessible Markdown report and a whitelisted JSON review. It uses the existing Analis fonts/palette, makes
zero network requests, reads no credentials and is not connected to Discord publication or Coach storage.

```powershell
node scripts/esports-scoreboard-review.js --input "<absolute eval input.json>" --out-dir "<absolute new eval directory>"
node --test test/esports-scoreboard-review.test.js test/esports-video-lab.test.js
```

Both paths must be inside the repository's ignored `.cloud/evals/`; the output directory must not exist and its
parent must exist. Input is capped at 64 KiB. Symbolic-link components and overwriting are rejected. Outputs are
`scoreboard-wide.png`, `scoreboard-portrait.png`, `review.md` and `review.json` (written last). A failed disk write
may leave partial previews, never a successful completion response. Do not use partial output as a completed review.

The input wrapper has `evidenceKind: "manual_transcription"` or `"model_candidate"`, and `observation` in the
scoreboard shape used by `inspectScoreboard`: source URL, source offset (nullable), event, series/game identity,
game duration, winner index, optional patch, two teams and five players each. Unknown fields should be `null`.
Manual origin is an operator declaration, not proof that a person checked every number. Use only the actual
source offset for that screenshot; a matching game with a different layout is not an exact timestamp match.

The cards distinguish game kills from series score. KP is `(kills + assists) / team kills`, rounded to one decimal.
Unknown values remain `?`, never zero. Invalid, incomplete or contradictory numeric data disables derived KP/gold
claims; zero team kills has unknown KP. No hero, item, MVP, draft order or causal gameplay advice is invented.
The JSON drops unrelated fields and always sets `reviewStatus: "REVIEW_REQUIRED"`, `trustedForCoach: false` and
`publishable: false`. Numeric consistency cannot establish visual extraction accuracy or source authenticity.

The FLCN/RORA local example is a manual transcription, not a successful Gemini observation. Its exact screenshot
offset and patch remain unknown. No public-match data is inserted into private-team or shared knowledge stores.
This is a view/export experiment, not an approve/correct UI or a production importer. Those require a later contract.

### Optional item-icon evidence

With the operator's permission to crop the supplied public screenshot, the same renderer can place six original
icon regions below each player. Item layouts are 1800x1240 (side by side) and 900x2280 (stacked). Existing Analis
type/colors and the bundled Hengs mascot are reused; statistics are code-rendered, not image-generated.

Add `itemEvidence` to the input wrapper:

- `kind: "manual_screenshot_crops"`, `manuallyReviewed: true`.
- `imageFile`: a lowercase alphanumeric/hyphen PNG basename adjacent to the input JSON, inside ignored evals.
  No remote URL, nested path or symbolic-link component is accepted.
- `imageSha256`: lowercase SHA-256 of the exact reviewed image; `width` and `height`: actual pixel dimensions.
  PNG signature, dimensions and hash are checked before decoding. Limits: 4 MiB, 4096 pixels per edge, 8 Mi pixels.
- `rows`: two teams in observation order, with five rows each. Every row contains `playerName` matching that
  observation exactly, and six `slots`. A slot is `{ "x": 0, "y": 0, "width": 31, "height": 31 }` within the source,
  or `null` when not visible. Crop edges must be integer pixels, 8 through 96 pixels wide/high.

Mark regions manually against the actual source. The example orders the top row left to right, then the bottom
row; this is **not purchase order**. Null slots display `?`; source cells that look empty retain their original
pixels. Unknown item names are not guessed, and extra fields cannot declare names, IDs or trusted build advice.
This is a per-image annotation, not automatic scene/slot detection or an item catalogue. A declared but missing,
changed or malformed image fails before output creation instead of silently omitting the items.

The report retains source hash/regions and `identification: "UNVERIFIED"`. The PNGs contain the authorized icon
crops, not the full source image or unrelated faces/account UI. Use only reviewed non-private sources; local
preview permission does not establish publication or redistribution rights. No provider or runtime is involved.

### Optional team marks

`teamLogoEvidence` is independent of the item evidence and follows the same reviewed-PNG source fields and limits.
Its `teams` array has two entries, in observation order, each with an exact `teamName` and a `region` rectangle
(`x`, `y`, `width`, `height`). Regions must be inside the source and 16 through 512 pixels per edge. A `null` region
means that team's logo is unavailable. Missing evidence uses neutral team initials; it does not invent a logo.

The operator must inspect the source and confirm which mark belongs to which team for that match. Changed names,
team order or image bytes fail validation. Logos are contained without stretching, recoloring or removing their
source background. The two optional sources may refer to the same reviewed image. A declared but missing/broken
logo source fails rather than silently displaying initials; absence must be explicit.

JSON retains `association: "OPERATOR_MARKED"` and `brandVersion: "SOURCE_MATCH_ONLY"`. This is not a verified
current-logo catalogue, automatic team-name search, official affiliation or publication permission. The example
uses 43x43 regions from Henry's original scoreboard; enlarged marks are limited by that source resolution.
No render-time remote logo request or provider inference is made, and production behavior is unchanged.

### Regional logo catalog and broadcast comparison

Optional `teamCatalog: "mpl-ph-s18"` selects eight checked MPL Philippines Season 18 team marks from
`assets/esports/teams/catalog.json`. Each collection is explicitly region/season scoped, with official source,
verification date, aliases, exact PNG hash/dimensions and an optional light presentation plate. See the asset
README for provenance and third-party rights. The files are reused offline, never fetched on each render.

Alias normalization handles case, spaces, dots and hyphens, but not fuzzy names or cross-region inference.
Unknown names use initials; unknown collections stop. A declared per-match `teamLogoEvidence` takes priority,
including explicitly absent regions. Broken explicit sources still stop instead of selecting a catalog substitute.
Catalog association is not proof that those exact marks were used in the historical match or a publication license.
The dated collection is not a complete current global MPL roster. Other regions will be verified in separate batches.

The wide card now puts duration, both final gold totals, their comparison bar and absolute gold gap in a neutral
column between the opposing rosters. Portrait moves the same comparison above the two stacked rosters. Gold gap
and KP remain disabled on numeric conflicts. No objectives, patch, hero identities or gameplay explanation are
invented to fill the middle column. Markdown remains the accessible text alternative; no browser interaction exists.

```powershell
node --test test/esports-team-catalog.test.js test/esports-scoreboard-review.test.js test/esports-video-lab.test.js
```

## Supervised public-video trial

`esports-video-trial.js` is an operator-only experiment, never a background worker. Importing it does not read
credentials, write files or call a provider. Before invoking its CLI, the operator must verify the public archive,
duration, exact visible scoreboard interval, project Free tier and model quota, source use, and authorization
for exactly one request. Its plan is an operator attestation, not a YouTube API metadata response or a technical
proof of price. Never use private scrim/chat data in this public Free-tier experiment.

The CLI accepts an absolute JSON plan directly inside `.cloud/evals/youtube-observer-2026-10-25/` containing
`trialId`, `model: "gemini-2.5-flash"`, canonical `sourceUrl`, UTC `verifiedAt`, `freeTierConfirmed: true`,
`publicArchiveVerified: true`, `approvedRequests: 1`, `durationSeconds`, `startSeconds`, and `endSeconds`.
The evidence must be less than 24 hours old. The trial caps the archive at eight hours and the interval at
60 seconds. It does not discover scenes automatically. Plan and result files stay ignored.

On Node 22.23.3 / Windows, use the supported system trust store while keeping HTTPS verification enabled:

```powershell
node --use-system-ca scripts/esports-video-trial.js --execute-once "<absolute approved plan path>"
node --test test/esports-video-lab.test.js test/esports-video-trial.test.js
```

The only credential source is ignored `.cloud/credentials/hengs/gemini.env`, with a single `GEMINI_API_KEY`
entry. Never place the value in command arguments, screenshots, logs or Git. Never disable TLS verification to
work around certificate errors. No credential is uploaded to the bot VM by this experiment.

The fixed Google `generateContent` request uses `fileData.fileUri` and `videoMetadata.startOffset/endOffset`
with one frame per second, one candidate, at most 4096 output tokens and a 512-token thinking budget. It sends
the public video URL and extraction instructions, not manually transcribed answer values. Timeout is 90 seconds,
response size is bounded, redirects are rejected, and no SDK retry, paid fallback, web search or tools are used.
Clipping support and quota accounting must be verified against current provider documentation; these settings
do not guarantee price, model availability, scene coverage or that an entire archive counts as just the clip.

An exclusive attempt marker is created before key loading/network access. It survives network failures and
process crashes. Do not delete it or change the trial ID to retry without new authorization. `requests: 1`
means one attempted fetch, not proof of provider receipt, billing or successful inference. No response prose or
raw provider error is persisted. Later diagnostics retain only a fixed failure category. Results can only become
`CANDIDATE_ONLY` or `NO_READABLE_SCREEN`; neither means verified Coach knowledge. Unknown fields stay null.

## Supervised public-frame trial

The same runner also supports `inputKind: "frame"`, separately authorized for exactly one reviewed public image.
Keep the common approval, freshness, trial ID and canonical source URL fields above. Select either the legacy
`gemini-2.5-flash` or explicitly approved `gemini-3.8-flash`; there is no automatic model fallback. The latter is
allowed only for this image probe, not the video path. Legacy support is not evidence the older model is available.

Frame plans replace the clip fields with:

- `publicFrameReviewed: true` after inspecting the actual file, excluding private account UI, chats and unrelated
  page content. Do not send a full browser screenshot just because its filename says scoreboard.
- `imageFile`: a PNG/JPEG basename directly inside the ignored eval folder, with no URL or directory traversal.
- `imageMimeType`: `image/png` or `image/jpeg`, matching the actual file signature, not just its extension.
- `imageSha256`: the exact reviewed bytes' lowercase SHA-256; maximum input size is 4 MiB.
- `frameOffsetSeconds`: a verified source position, or explicitly `null` when the precise image timestamp is unknown.

The request sends `inlineData` plus extraction instructions, not the source URL, expected answers or video metadata.
The source URL is local provenance only. Gemini 3.8 Flash uses `thinkingLevel: "low"` and no thoughts in the output;
one candidate, 4096 output tokens, 90-second timeout and the existing no-retry/secret boundaries still apply.
The operator, not the model, supplies the source offset. A missing offset remains review-required even when
scoreboard arithmetic reconciles. Every result stays `trustedForCoach: false`.

Verified contract references (25 October 2026): [generateContent parts](https://ai.google.dev/api/generate-content),
[image inputs](https://ai.google.dev/gemini-api/docs/image-understanding),
[Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash),
[thinking configuration](https://ai.google.dev/gemini-api/docs/generate-content/thinking), and
[pricing and Free-tier data use](https://ai.google.dev/gemini-api/docs/pricing).
Recheck the actual project's tier and model quota before any newly authorized request; code cannot prove price.

## Evidence as of 25 October 2026

The public source was manually matched at 04:14:06 to the supplied FLCN/RORA game-five scoreboard. This is manual
ground truth, not automated extraction. One 30-second trial failed before receiving a provider response because
of a local certificate-chain problem. The supported system trust store fixed read-only transport. After separate
authorization, one additional trial reached the endpoint but returned HTTP 404. The first runner discarded its
error body, so the precise 404 cause is unknown. Model metadata/list access succeeded, but that does not prove
video inference access. No usable model observation or token usage was returned, and no automatic retry occurred.

Two separately authorized image probes then used the original clean scoreboard image supplied by Henry. The exact
source offset for that original image is unknown; the browser reference at 04:14:06 uses a different broadcast
layout. The image-only 2.5 Flash request returned HTTP 404 / `MODEL_UNAVAILABLE`. This specific request had no video
URL to ingest. After separate model-change approval, the one 3.8 Flash request timed out at 90 seconds, without a
usable observation or token metadata. Timeout does not identify its cause or establish whether quota was consumed.

Stop live trials here. No automatic retries or model fallback occurred. All four attempt markers remain. Test
coverage is 960/960 offline, not proof of successful provider extraction. Next, validate the review/import experience
offline against the explicitly manual reference and resolve provider availability before requesting another trial.
Field-level model accuracy, live discovery, live gameplay input, multi-team isolation, retention and publishing
remain unverified. No raw broadcast downloader is included, and no bot, scheduler or Coach knowledge store is changed.
