# Offline scoreboard review

A local clickable companion to `esports-scoreboard-checklist.js`. It is not a Discord command, a provider integration, or an autonomous ingestion path.

## Operator workflow

1. Open the generated HTML in a browser. It works without a server or internet connection.
2. Select a sample and scoreboard section. The selected field highlights its evidence and shows a magnified crop.
3. Compare against the screenshot, correct the value if necessary, then choose **Konfirmasi & lanjut**. Skip anything unreadable. Do not infer names or numbers from another game.
4. Choose **Unduh sampel N** before closing. Each download contains only the selected sample, so download each edited sample separately. Partial reviews are supported. Text edits that have not been confirmed are excluded, even if the field was previously confirmed.
5. To resume, select the matching sample and choose **Buka review**. Import is rejected if the source, original candidate fingerprint, fields, types or evidence are invalid. Download current changes first. There is no automatic browser storage.
6. Validate the downloaded decisions using the Node command below. Completing 59 confirmations does not imply the scoreboard is consistent or trusted.

## Build and validate

Run from the repository with Node 22. No dependencies beyond the existing canvas package are needed.

```text
node scripts/esports-review-workbench.js build <manifest.json> <new-workbench.html>
node scripts/esports-review-workbench.js validate <manifest.json> <sample-number> <downloaded-review.json> [new-checked-packet.json]
```

Sample numbers are 1-based positions in the manifest, not validated game numbers. All output files must be new. Nothing is overwritten. A validation command can succeed structurally while returning `REVIEW_REQUIRED` because fields or consistency checks are unresolved. Only `OFFLINE_REVIEW_COMPLETE` means the local checklist is complete, still not publishable or trusted.

Manifest structure, using the source metadata already established for a candidate

```json
{
  "schemaVersion": 1,
  "samples": [{
    "candidatePath": "local-ocr-v2/game-01-candidate.json",
    "layoutPath": "local-ocr-v2/game-01-layout.json",
    "imagePath": "game-01-result.jpg",
    "source": {
      "imageSha256": "<actual SHA-256 of the screenshot>",
      "width": 1369,
      "height": 770,
      "sourceUrl": "https://www.youtube.com/watch?v=PYoBI4VtshE",
      "videoOffsetSeconds": 4320,
      "event": "MPL PH S18 Grand Finals",
      "seriesId": "match-8-flcn-rora"
    }
  }]
}
```

Paths are relative to the manifest folder and must resolve inside it. The builder verifies image bytes against SHA-256 and checks encoded dimensions before native decoding. PNG/JPEG only, at most 10 samples, 8 MiB per image and 32 MiB total. Layout cells must identify source pixel rectangles. A missing or invalid region stops the build. The winner preview covers both outcome labels rather than assuming which team won.

The generated HTML contains the supplied screenshots and sanitized OCR fields. Treat it as a copy of those sources and keep private material out of Git. Local evaluation artifacts belong under the ignored `.cloud/evals/` directory. Opening the YouTube source link is an explicit navigation, the only external action in the UI. The page itself has no network calls, CDN dependencies, local storage, upload or bot connection.

## Evidence boundary

Review decisions retain the existing caller-attested envelope and do not alter the original OCR candidates or accuracy measurements. Browser imports are not identity verification. Imported operator decisions remain labeled `operator_visual`, even after further clicks. The Node checklist is authoritative for arithmetic and roster consistency. This workbench intentionally does not duplicate those checks or claim that a completed UI review passed them.

No screenshot or annotation proves the reviewer actually inspected it. Neither hashes nor field confirmation are a signature or an authorization to publish, train a model or ingest Coach knowledge.
