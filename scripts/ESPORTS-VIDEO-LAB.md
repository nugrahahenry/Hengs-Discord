# Hengs esports video lab (offline experiment)

This is not an active YouTube watcher or a finished video extractor. It is not imported by the bot.
It makes **zero network requests**, loads no secrets, writes no runtime data, and cannot publish to Discord.
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
  no longer than 120 seconds. Its video-input descriptor is illustrative; provider invocation is not implemented.
- `inspectScoreboard(candidate)` checks game identity, timestamp, ten-player roster, kills/deaths, and rounded
  gold arithmetic. The reference gold rounding tolerance is specific to that scoreboard style. Every result is
  untrusted for Coach, including `CONSISTENT_CANDIDATE`. Arithmetic consistency is not image-reading accuracy.
- `REVIEW_PROMPT` separates observed facts, unknown fields, player/game clocks, and broadcast opinions. It is a
  draft for a later supervised provider evaluation, not a claim that prompt injection or hallucination is solved.

Tests use synthetic fixtures. They do not prove video access, automatic scene discovery, live ingestion,
OCR/vision accuracy, gameplay understanding, source-use rights, cost, or compatibility with all broadcasts.

## Next gate

Choose the provider/model and a capped trial budget, securely configure project-scoped credentials, review source
use, and select a known short archived segment. Validate field-level output against the actual screen before any
knowledge-store integration. Live discovery, live gameplay input, multi-team data isolation, persistent state,
retention and publishing require separate implementation and acceptance. No raw broadcast downloader is included.
