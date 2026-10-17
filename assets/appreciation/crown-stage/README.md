# Crown Stage artwork

Bundled offline artwork for reviewed Hengs appreciation posters. No runtime generation,
external downloads, user-selected file paths or automatic publication.

- `arena-background.png` and `trophy.png`: generated in Codex with Henry's explicit permission
  on 17 October 2026, after the shared-usage notice. Decorative stage and trophy, not evidence
  of a real event or an organizer-issued certificate.
- `hengs-family-cutout.png`: generated transparent derivative of Henry's supplied Hengs Family
  crest. The original remains unchanged at `assets/brand/hengs-family.png`. This derivative is
  visually related, not pixel-identical. Only exact Hengs Family/Familia recipients use it.
- Three Barlow font files: Google Fonts `ofl/barlowcondensed` and `ofl/barlow` sources,
  distributed with `barlow-ofl.txt` (SIL Open Font License 1.1).
- Two bold icons: Phosphor Icons `core/assets/bold`, distributed with `phosphor-license.txt`
  (MIT). The renderer changes `currentColor` to the palette color in memory.

All result, team, event, date and roster text is rendered from validated draft fields.
No real player names, event facts or certificate are baked into the art. Other teams use
the neutral trophy; an appreciation without an explicit ranking never displays an invented
rank. Full literal details stay in the Discord embed even when the image cannot render.

The 1080px-wide poster has a minimum height of 1350px and can grow for long text or up to
eight players. It is static, not animated. Fonts and fixed art are decoded once per process;
rendered posters and roster input are not cached or persisted by the renderer.
