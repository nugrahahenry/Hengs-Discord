# MPL team artwork catalog

Local, versioned artwork for offline Hengs previews. Phase one covers **MPL Philippines Season 18: eight teams**,
checked 25 October 2026 against the [official teams page](https://ph-mpl.com/teams). Other regions are planned,
not silently included. Never reuse a Philippine match merely because a different region has a similarly named team.

`catalog.json` records collection, region, season, official display name, explicit aliases, source URL, dimensions
and SHA-256. Files in `mpl-ph-s18/` are the exact downloaded bytes. The official CDN paths end in `.webp`, but all
eight responses were actual PNGs, so local extensions match their signatures. No AI redraw or recoloring.
Dark marks (ONIC PH, Smart Omega and Twisted Minds PH) use a light presentation plate for contrast,
recorded as `plate: "light"`; this changes the surrounding card, not the source artwork.

The renderer opts into `teamCatalog: "mpl-ph-s18"`. It performs no lookup/download during rendering. Unknown aliases
use initials; unsupported collections stop. An explicit per-match screenshot logo takes precedence over the catalog.
The collection is a dated visual reference, not proof of historical/current branding outside that season.

## Rights and sources

Logos remain the trademarks/copyright of their respective teams. Public availability does not grant a license or
imply affiliation. These copies support local identification/review; assess permissions before public redistribution
or release. The preview remains unpublished and untrusted for Coach. Do not label third-party artwork as Hengs-owned.

Official page: https://ph-mpl.com/teams

Linked source CDN: https://ik.imagekit.io/nloe8dhf7w/mplph/s18/teams/

| Team | Local file | Original CDN filename |
| --- | --- | --- |
| AP BREN | ap-bren.png | apbren-400.webp |
| Aurora Gaming | aurora-gaming.png | aurora-gaming-400.webp |
| ONIC PH | onic-ph.png | onicph-bw-400.webp |
| Smart Omega | smart-omega.png | smart-400.webp |
| Team Falcons | team-falcons.png | falcon-400.webp |
| Team Liquid PH | team-liquid-ph.png | tlph-400.webp |
| TNC Pro Team | tnc-pro-team.png | tnc-400.webp |
| Twisted Minds PH | twisted-minds-ph.png | twistedminds-400.webp |

## Add the next region

Verify its official region/season team list, inspect each logo, save exact bytes with the real file extension,
record source/dimensions/hash and bounded aliases in a separate collection, then run catalog/renderer tests and
inspect a contact sheet. Do not mix collections, fuzzy-match unrelated teams, or automatically refresh existing files.
