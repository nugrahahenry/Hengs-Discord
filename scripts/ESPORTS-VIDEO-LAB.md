# Hengs esports video experiments

These are not an active YouTube watcher or a finished video extractor. Neither script is imported by the bot.
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
