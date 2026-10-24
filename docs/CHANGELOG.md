# Changelog — Discord Bot "Hengs"

Format: [Keep a Changelog](https://keepachangelog.com/id/1.1.0/) · Versi: [SemVer](https://semver.org/lang/id/).
Lihat aturan lengkap di `../../../../KONVENSI-VERSI.md`.

## [Unreleased]

## [1.82.1] - 2026-10-24

### Changed

- The draft card takes Henry's GPT image as a backdrop of any landscape size (scaled to cover, a light dark overlay
  for readable text) and Hengs always draws the panels and slots on top. GPT images here come out at sizes like
  1672x941 or 1536x1024, so a template with exact slot positions would never line up with the text. Checked with a
  stand-in 1672x941 backdrop.

### Verification

- Node 22 full suite 932/932 via PowerShell (the tree also held another agent's uncommitted welcome-card test).

## [1.82.0] - 2026-10-24

### Added

- Broadcast-style draft card per game for pro series. Henry: "laga pro itu bisa dikembangin sama gpt gak buat template
  draft broadcast nya?" and "Bangun v1.82.0 kartu draft broadcast per game ... versi gambar kode dulu sambil gw bikin
  template di GPT".
  - `src/esports/draft-card.js`: 1600x960, blue side left and red side right, five pick slots per side with the
    hero's role (Liquipedia hero dictionary) as a coloured chip, five dimmed bans per side, the series score after the
    game, length, objective, and the winner marked MENANG. Only decided games with five picks a side get a card.
  - Fixed `LAYOUT` shared with Henry's GPT template: `assets/esports/draft-bg.png` (1600x960). With the file Hengs
    draws only text and chips on it; without it Hengs draws the panels and slots itself.
  - The series card message carries the draft cards in the same gallery (result card first, then game 1 to n);
    Liquipedia corrections re-render them with the card.
  - No first-pick label: Liquipedia stores sides, not pick order, and blue = first pick is only inferred.
- Item, emblem and KDA stay out of pro cards (no legal source); scrim stat cards from member screenshots are on the
  Coach session's path.

### Verification

- Node 22 full suite 931/931 via PowerShell. Sample draft card rendered from mock data.

## [1.81.0] - 2026-10-24

### Added

- Hengs Analis caster. Henry: "Gw maunya kan llm, bikin jadi LLM aja lah", then "Komentator + bisa ditanya".
  - `src/esports/commentator.js`: Groq `openai/gpt-oss-120b` in JSON mode writes a caster-style line for the preview,
    the night recap and the event recap, only from a fact card made of the card's own lines.
  - The check: every number, every hero from the Liquipedia hero dictionary and every team name or ticker on the
    watched pages that the text names must appear in the facts (for an answer, also in the question); no betting
    words; a length cap. One retry with the rejected tokens named, then the template caption.
  - Analis questions in #tanya-hengs (chat intent `analis`) are answered from a 7-day card (results with MVPs, today's
    schedule, the next matches, top picks and bans, and a line for each hero the question names), with the same check.
    No data or a failed check falls back to the guide. No Liquipedia request per question.
- Live probe (mock matches, Groq, about 10 requests): captions and answers kept to the facts; "Lancelot menang berapa
  kali?" got the right count once named heroes had their own line; no answer says "FAKTA" any more.

### Changed

- Release pins: v1.80.1 left `test/cloud-release.test.js` at 1.80.0; all pins are 1.81.0 now.

### Verification

- Node 22 full suite 926/926 via PowerShell.

## [1.80.1] - 2026-10-24

### Changed

- Welcome and leave cards now use a compact hero pill, stronger member-name focus, and a clearer Hengs logo watermark.
- Added the v2 visual preview at `assets/_originals/welcome-card-v2-preview.png` for review before deployment.
- Verification: `node --test test/member-onboarding.test.js` passed 11/11.

## [1.80.0] - 2026-10-24

### Added

- Hengs Analis match days. Henry chose "Per hari tanding", "jadwal dan rekor musim, kalau bisa kasih tebak juara dan
  rekap malam yang berapa yang bener", and asked for previews that look like broadcast screens from his GPT assets.
  Spec: docs/superpowers/specs/2026-10-24-hengs-analis-harian-design.md.
  - Preview at 08:00 WIB on match days: one card per match with the WIB time, best-of, head-to-head this season and
    each team's three most picked heroes, plus two buttons to guess the winner. The latest choice counts until the
    match starts; the reply is private. A changed schedule edits the posted preview. Busy days (more than 4 matches)
    get one schedule card plus up to 4 featured previews, Indonesian or Philippine teams first.
  - Night recap after the day's last match (at the latest 23:30 WIB): results, most picked and most banned hero, the
    best win rate from three picks, blue versus red, MVPs, and the share of voters who guessed right per match.
  - Event recap once after the grand final: champion, runner-up, finals MVP, top 5 picks and bans, longest and
    shortest game, blue versus red and the three best guessers (names without pings).
  - Watchlist: MPL ID S18 Regular Season (season records) and Playoffs, Esports Nations Cup 2026 Group Stage and
    Playoffs, M8 World Championship, plus a daily prefix search that adds new M8 stage pages. Titles VERIFIED with the
    Liquipedia API on 2026-10-24; still one revisions request per check, and one fresh check from 07:30 WIB.
  - Cards drawn by Hengs (no logos or hero art); optional backgrounds from Henry's GPT assets:
    `assets/esports/preview-bg.png` (1600x900) and `assets/esports/recap-bg.png` (square). Captions are templates; the
    LLM caster with a fact check is v1.81.0.
- Modules: `src/esports/watch.js`, `schedule.js`, `predictions.js`, `daily.js`, `daily-cards.js`; the store keeps
  daily claims (claim before send, no resend), votes (deleted 7 days after the event recap, 30 days at most) and
  discovered pages. Failed sends go to bot-settings through the v1.79.2 reporter.

### Changed

- Series cards and their 72-hour upkeep still follow a fresh Liquipedia check; match-day posts run every tick from the
  cache. `index.js` routes `hengs-analis:` buttons to the vote handler. The pinned guide explains previews and guesses.
- Release pins: v1.79.3 bumped the package to 1.79.3 but left `test/cloud-release.test.js` at 1.79.2; both are 1.80.0
  now.

### Verification

- Node 22 full suite 920/920 via PowerShell. Sample preview, night recap and event recap cards rendered from mock
  matches.

## [1.79.3] - 2026-10-24

### Changed

- Kartu welcome dan leave sekarang memilih `assets/brand/hengs-bot-icon-v2.png` sebagai logo utama, dengan fallback
  ke aset lama dan override `HENGS_LOGO_PATH` tetap dipertahankan.

### Verification

- `node --test test/member-onboarding.test.js`: 11/11 lulus.

## [1.79.2] - 2026-10-24

### Fixed

- Failed sends no longer fail silently. The welcome card had failed on a channel permission since mid-October (3 of
  5 joins: @everyone was denied Send Messages in #welcome and Hengs had no overwrite) and nobody knew until Henry's
  friend joined without a welcome. Henry: "bikin Hengs lapor ke bot-settings kalau kirim welcome gagal (sebut izin
  yang kurang)", then "Fitur lain yang gagal kirim" too.
  - `src/utils/failure-report.js`: one reporter posts a note to bot-settings, without pings, naming the
    permissions Hengs lacks the way Discord's channel settings word them ("Send Messages") with the fix steps, or
    the error code, or that the channel is gone.
  - The same feature, channel, person and reason is noted once per 6 hours, so a failure that repeats every tick
    does not flood bot-settings; each member's failed welcome still gets its own note.
  - Covered: welcome (permissions checked before the card is drawn, a missing WELCOME_CHANNEL_ID channel, send
    errors), leave card, boost message, scheduled news and memes (failed send, channel gone, missing permissions;
    feed trouble is not a send failure) and Hengs Analis cards.
  - `postBotSettings` finds the channel through the same `findBotSettings`.
- One-off, owner-approved: the 3 members who missed their welcome since 15 Oct were listed in bot-settings by a
  read-only cloud probe plus one REST post (no gateway login, no pings).

### Verification

- Node 22 full suite 895/895 via PowerShell.

## [1.79.1] - 2026-10-24

### Added

- Mascot banners and a sticker set from Henry's GPT assets (commit b7ad9e9): `assets/brand/` (bot character sheet,
  coach poses, Hengs Family crest and profile set, server, general, news and memes banners) and `assets/stickers/`
  (8 stickers with a README). No feature uses them yet.

### Changed

- Hengs chat no longer opens an unsure answer with "maaf", like the coach. Henry: "Boleh disamain, kasih aja ke chatt
  hengs". Code (`dropSorryOpener` in src/agent.js, run before the coach guard and before history) drops a "Maaf, aku
  belum tahu / punya / yakin ..." opener and keeps the rest. Condolences ("Maaf banget dengar itu") and polite
  refusals ("Maaf, aku nggak bisa ...") keep theirs. The prompt's honest game facts rule is unchanged.
- Why not the coach's whole rule: chat has no data card. Live probes on 2026-10-24 where chat had to start from what
  it knows invented a fake hero's ultimate, a fake item's passive, a "latest" MPL ID champion and Ling skill names.
  A prompt line that only banned the maaf opener still hurt honesty: in an A/B the fake item got invented stats 3 of 4
  times with it and 1 of 4 without it. So the tone moved into code, where it cannot change what the model claims.

### Verification

- Node 22 full suite 889 total, 888 pass, 1 skip in an isolated worktree with only this change (the skip is the
  folder-name check in wa-recovery-alerts). Live: the unsure answers to textbook exam C5, C6 and C7 now start with
  "Aku belum ..." and stay honest. Answers in .cloud/evals/textbook-2026-10-23 (answers-fun*, answers-ab*,
  answers-final).

## [1.79.0] - 2026-10-24

Hengs Coach v2, merged from branch `coach-v2` (its provisional v1.78.0 and v1.79.0).

### Added

- Pro draft numbers for the coach: a meta, pick, ban or draft question (or one naming a hero) adds a "META PRO" card
  counted from the Liquipedia pages Hengs Analis already keeps (decided games with full 5v5 drafts only): the five most
  picked and banned heroes with the game count, plus pick, win and ban lines for a named hero. The coach must say it is a
  pro pattern that may not suit the team. An unreadable esports file just leaves the card out.
- MLBB hero dictionary: `src/scrim/mlbb-heroes.json`, a dated Liquipedia snapshot of all 133 heroes (title, roles,
  lanes, specialties), built by `scripts/build-mlbb-heroes.js` through the MediaWiki API under its terms (two requests).
  A question naming a hero adds its facts ("KAMUS MLBB"); a question about lanes or roles adds the lane and role names.
  The official mobilelegends.com data API is not used (MLBB ToS section 11 bans automated collection).
- Any coach reply built on either card ends with "-# Data: Liquipedia (CC-BY-SA 3.0)".
- `/scrim target [isi]` (Hengs Family): the team's one practice target, a habit the team can check itself (Henry asked for
  a smarter coach: "biar makin pintar dan mantep"). With `isi` it is set, masked like coach replies, and announced in
  hasil-scrim without pings; without `isi` it is shown privately with the games logged since. Stored in its own file
  `data/scrim-coach.json` (target text, who set it, when); a target older than 14 days is treated as stale.
- The coach reads a fresh target into its data card ("TARGET TIM", with the games logged since) and links its answer to
  it; when asked for a target it points to `/scrim target`.
- Debrief nudge without AI: the third game logged on one WIB day brings one message in hasil-scrim with three debrief
  questions (what worked, one decision to fix, the next target) and the current target. Never between 22.00 and 05.00
  WIB, at most once a day (the day is claimed before the send). Debriefs after a scrim block are the coaching habit with
  the strongest evidence in the research (`docs/research/2026-10-23-coaching-practice.md`).

### Changed

- Coach rules for the three weak spots of the last exam: a ward question must get one alternative tip, a blamed teammate
  gets an answer ("nggak setuju pakai label buat teman"), and an opponent question uses that opponent's recap.
- The cards now carry their own caveats, because exam v7 showed the model dropping them: the target line says the
  notebook does not track whether the target worked, the pro card ends with "pola tim pro dari N game, belum tentu cocok"
  (and "sampelnya kecil" under 20 games), hero specialties read "keahlian (bukan nama skill)", the lane list says it has
  no lane mechanics, a team under 5 games gets a small-sample line, and the reminder asks for one focus set with
  `/scrim target`. `agent.chat` takes an optional `maxTokens` (200 to 1500); coach turns use 900 so answers are not cut.
- After exam v8 and v9 (Henry: "Rapihin sisa kelemahan coach yang lain dulu"): the card says "TARGET TIM: belum ada" when
  no target is set, an opponent question gets a line pointing at that opponent's recap, the one-focus push to
  `/scrim target` comes only on questions about training, a focus or setting a target (on every question it turned into
  advice to track results and pro heroes with it), and code adds "Pola draft pro belum tentu cocok buat tim sendiri"
  next to the Liquipedia credit whenever the pro card was used.
- Henry asked that unsure answers stay fun instead of a bare "gatau" (exam v7: 6 of 26 answers opened with maaf or
  nggak yakin). In coach mode a rule replaces the general "bilang nggak tahu" rule: start from what the data or the
  dictionary does say, hedge once ("masih susah dipastiin"), give one way to find out together, never open with maaf
  or close with "kalau ada hal lain tanya aja". A ward question gets the alternative tip in its first sentence. The
  lane card counts who fills each lane from the snapshot (Gold Lane 18 Marksman of 19 heroes, and so on) and says lane
  positions and mechanics are not in it.
- Exam v11 showed that naming the generic closer in the rules primed it (3 of 12 answers ended with it, none before),
  so the rules no longer name it and the reply guard drops a last sentence about "hal lain" or "pertanyaan lain"
  (kept when it is the whole reply).
- Help: the scrim paragraph is shorter and names `/scrim target`. `/hengs privacy` says the coach also reads the team
  target and that it is kept until replaced; the scrim line is shorter so the page stays under 2000 characters.

### Verification

- Coach exam (local, `.cloud/evals/coach-2026-10-23`): v7 with 26 scenarios scored the 20 old ones 36/40 (v4: 33/40)
  but the 6 new ones (target, pro meta, hero dictionary) 3/12, with an invented target result and invented lane
  mechanics. After the card fixes the 10 weakest re-ran at 15/20 (they had 7/20), with nothing invented. Twelve
  scenarios (weak ones plus controls) went 18/24 (v9) and then 21/24 (v10) after the last two fixes. Still variable
  between runs: the gold vs EXP lane question sometimes gets invented lane mechanics, and the ward question sometimes
  gets no alternative tip.
- Node 22 full suite in the worktree (PowerShell): 884 tests, 883 pass, 1 worktree-only skip. Not deployed.
- Node 22 full suite in the worktree (PowerShell): 871 tests, 870 pass, 1 worktree-only skip. Not deployed; deploy needs
  command re-registration for the new `target` subcommand.
- Merged into main on top of v1.78.0 (setup v2): Node 22 full suite 888/888 via PowerShell. The worktree's
  one skip was the workspace-path check in `test/wa-recovery-alerts.test.js`, which runs in main. Not deployed;
  the deploy needs command re-registration for `/scrim target`.

## [1.78.0] - 2026-10-24

### Added

- `/admin setup` v2, a guided community setup. Henry: "Tampilannya oke, lanjut bangun wizard setup v2 (paket, tema,
  preview, rename opsional, tema custom)."
  - Step 1 picks packages in a multi-select: Lobby, Komunitas, Gaming, Hengs, Tim scrim, Creator, Voice.
  - Step 2 asks News + Memes (both, one or none) for the Hengs category.
  - Step 3 shows a theme board image (Emoji + titik, Garis tegak, Panah pohon, Kurung neon, Polos) and a
    "Tema custom" modal with `{emoji}` and `{nama}` patterns, previewed the way Discord stores names.
  - Step 4 shows the planned sidebar as an image (BARU and GANTI pills) with a "Samakan nama lama" toggle, off by
    default, that renames decorated existing channels and categories to the theme.
  - "Bikin sekarang" re-checks the inventory hash, then creates categories first and channels inside them with
    permissions by kind, gives reused Hengs channels the same permissions as new ones (news, memes, analis
    read-only; hasil-scrim private to Hengs Family), pins the tanya-hengs and analyst guides, renames, and reports
    failures by name without retry.
- `src/guilds/channel-style.js` (themes, custom theme, slug), `src/guilds/community-setup.js` (packages, pure plan
  builder, apply), `src/guilds/setup-preview.js` (sidebar and theme board renderer).
- Bundled assets, since the VM has no emoji or symbol font: 40 Twemoji 72x72 PNGs (jdecked/twemoji v15.1.0,
  CC-BY 4.0) and DejaVu Sans 2.37, credited in `assets/setup/README.md`. A test checks that every package emoji
  has its picture.

### Changed

- Every channel lookup matches by slug (`slugOf`: lower case, decoration removed front and back), so themed names
  such as `╰┈➤tanya-hengs🤖` still count as `tanya-hengs`: chat placement, community help, the /kirim intake,
  scrim and analyst.
- `/admin getroles` also finds `ambil-role`.
- The setup subcommand description now reads "Setup komunitas: pilih paket, tema dan lihat preview sebelum channel
  dibuat", so commands must be registered again at deploy.

### Removed

- The old setup menu (News saja, News + memes, Scrim tim, Analis MLBB, Tanya Hengs) and the legacy "Setup lengkap"
  template (stats channels, GSA webhook, Henzzz categories), with their helpers `ensureNewsChannel`,
  `ensureCommunityChannels`, `ensureScrimSetup`, `ensureAnalystChannel` and `ensureTanyaChannel`. The wizard covers
  each path.

### Verification

- Node 22 full suite 864/864 via PowerShell. Sample theme board and sidebar previews rendered from a mock server.

## [1.77.0] - 2026-10-24

### Added

- `/admin setup` > Tanya Hengs: preview, then create or reuse `🤖・tanya-hengs` in the `bot-commands` category.
  Henry: "itu bot commands niatnya buat bot musik juga ... kalau khusus buat hengs bikin aja lagi tanya hengs".
  - Members keep the server's own permissions there (chatting, attaching images). Hengs gets one overwrite: view,
    history, send, embed, attach and react, plus Pin Messages when the server already granted it.
  - When the channel is newly created, Hengs posts and pins a guide (`chatGuide`) with examples, the Lanjut button
    rule, the hasil-scrim privacy note, the 40-a-day cap, a no-personal-data note and "AI bisa salah".

### Changed

- `bot-commands` stays shared with other bots (music and the like). Once a `tanya-hengs` channel exists, a mention
  of Hengs in `bot-commands` only gets 👋. Before that, Hengs keeps chatting there. Hengs' slash commands are
  unaffected.
- The `/kirim` intake always accepts `tanya-hengs`, even when `BOT_CHANNEL_ID` points at `bot-commands`, so chat
  shares from `tanya-hengs` work.

### Verification

- Node 22 full suite 863/863 via PowerShell.

## [1.76.0] - 2026-10-24

### Added

- Chat mode phase 2. Henry: "Lanjut tahap 2: kirim meme/berita dan catat/hapus scrim lewat chat, pakai tombol
  konfirmasi yang cuma bisa dipencet yang minta."
  - `src/chat-actions.js`: a chat request gets one public line and a "Lanjut" button.
    - The ticket lives 10 minutes, works once, and is bound to the guild, the channel and the requester. Anyone
      else gets a private "Tombol ini bukan buat kamu".
    - The click runs the existing slash flow on the button interaction with the chat values as its options:
      `sharing.submit` for `/kirim`, `scrim.preview` for `/scrim hasil`, `scrim.remove` for `/scrim hapus`.
    - The image review, intake checks, private preview and final confirm are unchanged.
  - Kirim, in `tanya-hengs`, on intent `kirim`: the message's first PNG/JPG/WebP is a meme, otherwise its first
    HTTPS link is news; with neither, Hengs sends the guide. Captions and notes stay on `/kirim`.
  - Scrim, in `hasil-scrim`, before the coach: the classifier returns `scrim_catat` or `scrim_hapus`.
    - `scrim_catat` comes with clean slots: `lawan` up to 60 characters, `hasil` from the six `/scrim hasil`
      choices, `catatan` up to 300. The message's image becomes the SS.
    - A missing opponent or result gets a question, never a guess.
    - In `tanya-hengs` these intents point to `hasil-scrim`.
  - The classifier now returns `{ intent, slots }`, and its prompt says never to guess an opponent or a result.
    `index.js` routes `hengs-chat:` buttons, and one helper charges the daily cap for both chat channels and
    `hasil-scrim`.

### Verification

- Node 22 full suite 859/859 via PowerShell.
- Live classifier probe on the local Discord key (gpt-oss-20b, 4 requests, 2026-10-24):
  - "catat scrim lawan RRQ, kita kalah gara-gara draft" → scrim_catat, RRQ, kalah-draft;
  - "hapus scrim terakhir dong aku salah input" → scrim_hapus;
  - "kita menang lawan EVOS tadi, catet ya" → scrim_catat, EVOS, menang;
  - "tadi scrim kalah" → scrim_catat with no opponent, so Hengs asks.

## [1.75.0] - 2026-10-24

### Added

- Chat mode phase 1 for the home server. Henry chose "semua fitur lewat chat". A council then settled where it
  lives, and Henry approved: `tanya-hengs` (renamed `bot-commands`) plus `hasil-scrim`, no DM, 👋 in `ngobrol`,
  and the provider chain like WA with one key per bot.
  - `src/chat-mode.js` decides the placement from the channel name, threads included:
    - chat in `tanya-hengs` (or `bot-commands` until the rename) and `bot-settings`;
    - coach in `hasil-scrim`; a mention the coach does not take gets a pointer;
    - silent in `hall-of-fame`;
    - a single 👋 reaction everywhere else, with no text and no LLM call.
  - When the keyword rules miss, an intent classifier runs: `agent.completeIntent`, Groq gpt-oss-20b in JSON mode
    at temperature 0, reasoning effort low, 8 s timeout, no OpenRouter fallback. It gets only the message text.
    Groq limits are per organisation and per model, so the chat model's quota is untouched.
  - The feature intents are help, news, memes, analis, scrim, kirim, lapor, caster and event. Each gets a fixed
    guide with channel links and the slash command to use; chat never posts feature content. Scrim requests
    point to `hasil-scrim`, `/scrim statku` and `/scrim tanya`. Unknown or failed answers fall back to normal chat.
  - Every member gets 40 home LLM messages per WIB day (classifier and chat count as one); the guild owner is
    exempt.

### Changed

- `@everyone`, `@here` and role pings no longer count as mentioning Hengs. discord.js defaults made an admin's
  `@everyone` wake Hengs in any channel. A reply to a Hengs message still counts.
- The bot channel is `tanya-hengs`:
  - `botCommands(guild)` prefers it and falls back to `bot-commands`;
  - the `/kirim` intake accepts either name when `BOT_CHANNEL_ID` is unset;
  - user-facing copy now says `tanya-hengs`.

### Verification

- Node 22 full suite 853/853 via PowerShell.
- Live classifier probe on the local Discord key (gpt-oss-20b, 6 requests, 2026-10-24):
  - "ada berita apa hari ini" → news; "hasil MPL semalem gimana bro" → analis; "rekap scrim tim kita dong" →
    scrim; "mau kirim meme gimana caranya" → kirim; "jelasin fotosintesis singkat" → chat.
  - One cold first call hit the old 6 s timeout, so the timeout is now 8 s.

## [1.74.0] - 2026-10-23

### Added

- Coach chat for Hengs Family (Henry: "gw pengennya sih bisa jadi llm bukan cuman yang command gitu doang"). A team
  member who mentions Hengs (or replies to it) in hasil-scrim reaches a coach mode of the normal Hengs chat. Before
  the call, code builds a data card from the scrim notebook: the team recap, the recap against an opponent named in
  the question, and the WIB time. Coach rules come from sourced coaching research: one focus per answer (target, where
  the team is, one concrete next step), process goals written into the next `/scrim hasil` note, a reflection
  question, decisions instead of people, wins reviewed too, no other player's stats, numbers only from the card. The
  model never sees Discord IDs or raw rows.
- `/scrim tanya pertanyaan` (Hengs Family, private): one question, answered with the team recap plus the asker's own
  stats, with no history kept.
- Code checks every coach reply before it is stored or shown: swearing and blame labels are masked (`n***`), with
  leetspeak, repeated letters and common affixes caught, so advice and a crisis reply are never dropped over one quoted
  word. The model's help marker (any common spelling), or a crisis word in the question, adds a fixed helpline text
  checked on 2026-10-23 (SAPA 129 KemenPPPA, Healing119 Kemenkes, 110). 15 answered coach questions per person per WIB
  day, counted in memory; cooldown and outage replies cost nothing.
- The data card reaches the model as a user message, not system text, so notes written by members carry no authority.
  Discord mentions and IDs in notes and questions are replaced before the model sees them.
- The coach answers only in the real hasil-scrim (or a thread inside it), after the same checks as posting a card.
  A Discord error answers with an error instead of falling back to shared chat.
- Coach chat keeps its own short history (12 messages, 4000 characters per request), apart from shared and private
  chat, so team numbers never travel into other channels. `/hengs reset` clears it too.
- Coach rules tuned with a 20-scenario coach exam (local, `.cloud/evals/coach-2026-10-23`): the most-broken bans come
  first, one reminder line closes the data card, temperature 0.3, code decides when it is late (22.00 to 05.00 WIB),
  targets are habits rather than wins, no links. Code also hides a member note that contains an insult (the model spun a
  masked one into praise) and rewrites made-up "N menit pertama" windows to "di awal game".

### Changed

- Help: the scrim paragraph names the coach and drops the option list (the command shows it). `/hengs privacy` says
  coach questions go to the AI provider with the team recap (plus the asker's own stats for `/scrim tanya`) and lists
  the coach context size.
- `/scrim hasil` treats unknown @everyone permissions on hasil-scrim as public (it used to treat them as private).

### Verification

- An independent review found nine issues before release (helpline lost when a reply was blocked, Discord IDs in notes,
  look-alike thread names, blocked replies kept in history, gaps in the word list, a strict help marker, quota spent on
  failures, Discord errors falling back to shared chat, notes inside system text); all are fixed with tests.
- Coach exam through the real chat path (gpt-oss-120b, Hengs Discord key), graded 2/1/0 against keys frozen before the
  first run: plain Hengs chat 19/40; coach before tuning 17 to 20/40 (wards from other games, own percentages, made-up
  minutes); after tuning 29/40 then 33/40 (average 1.65). No privacy leak and no shown forbidden word in any run. The
  three scenarios the last two code fixes target re-ran at 2/2 each. One run per scenario, so a few points are noise.
- Node 22 full suite in the worktree (PowerShell): 816 tests, 815 pass, 1 worktree-only skip. Not deployed; deploy
  needs command re-registration for the new `tanya` subcommand (still 14 home commands).

## [1.73.0] - 2026-10-23

### Added

- `/scrim hapus` (Hengs Family): shows the requester's own last logged game privately (opponent, result, WIB time,
  lineup) with "Hapus game ini" and "Batal". Hapus removes the row from `data/scrim-games.json` first, then pulls the
  card from hasil-scrim; a card that is already gone counts as done, and a card that cannot be pulled is reported so an
  admin can delete it by hand. Team role and ownership are checked again on the click; a double click deletes once.
- Deleting one Hengs card in hasil-scrim (an admin with Manage Messages) drops its game too, so the recap and the
  channel stay in sync. Bulk purges deliberately do not touch the notebook.

### Changed

- Coach voice is now Gen Z santai, for the kids who use it (Henry: "coach gaul ... yang pakai juga bakal bocah
  bocah"). Every coach text changed: the `/scrim hasil` dropdown (W, or L with the reason), preview and card
  ("MLBB vs X: W", "Skor hari ini vs mereka", "Dicatat sama"), recap and statku DM ("W 3 dari 5 game (60%), lumayan
  gacor 🔥", form "W W L W L", "datanya masih dikit, belum bisa dinilai"), error and permission replies, and the
  `/scrim` descriptions.
- The hype phrase sits only on the total line and only from 5 games; a losing run gets "lagi seret, santuy, gas
  latihan 💪". No swearing (anjay included), no blaming players, no mocking opponents; a test guards the words.
- Number rules unchanged (n on every line, percent from 5 games, "paling sering" from 5 losses). Stored values
  (`menang`, `kalah-*`) are unchanged, so older games keep reading. Help and `/hengs privacy` are unchanged.

### Verification

- Node 22 full suite in the worktree: 788 tests, 787 pass, 1 worktree-only skip. Not deployed; deploy needs command
  re-registration because choice names and descriptions changed (still 14 home commands).

## [1.72.3] - 2026-10-23

### Fixed

- Hengs chat (home and public prompts) admits unknown game facts instead of inventing them. Hero, skill, item, battle
  spell, objective, patch, number, schedule or champion facts are answered only when the model is sure; otherwise it
  says it does not know, without invented names or numbers, points to official patch notes for recent info and
  corrects false premises. In the textbook exam (30 questions through the real chat path, gpt-oss-120b) the score went
  from 32/60 to 40/60 and answers with a confidently wrong fact from 17 to 10. Plausible-sounding fake names (a battle
  spell, an objective, a new hero) still slip through, so MLBB facts still need a sourced knowledge file.

### Verification

- Node 22 full suite in the worktree: 780 tests, 779 pass, 1 worktree-only skip. Not deployed; no command, env or data
  change.

## [1.72.2] - 2026-10-23

### Fixed

- Hengs Analis reads Liquipedia's newer `|mapmode=` field as well as the old "[[Team]] picked [[Mode]]" comment.
  Liquipedia added the field on 2026-10-15 (Lua-Modules commit bd1eaba, PR #8167) and plans a bot run that moves
  old comments into it. Without this, cards would silently lose the "Objektif" line. The field names only the
  mode, so the card then shows "Objektif: Golden Turret" without a team. Found by the stats-sources research
  (docs/research/2026-10-23-mlbb-pro-stats-sources.md).

### Verification

- Node 22 full suite 809/809 via PowerShell.

## [1.72.1] - 2026-10-23

### Fixed

- Every meme now gets real reaction buttons (😂 😐 💀 under the message), not only Hengs-made ones. Henry could not
  react: since the v1.71.0 deploy the only meme was from Lemmy (17:01), and it had no reactions. The emoji he saw
  were part of the card text ("😂 Dari Lemmy"). Lemmy and xkcd cards also say "Reaksi 😂 kalau lucu, 😐 kalau
  garing." without claiming Hengs learns from them. The taste store still learns only from Hengs-made memes.

### Verification

- Node 22 full suite 808/808 via PowerShell.

## [1.72.0] - 2026-10-23

### Added

- Hengs Analis: one result card per finished MLBB pro series in a read-only `📊・hengs-analis` channel. Henry asked
  for MPL recaps from the strongest region (the Philippines, six straight M titles) without screenshots, in a
  dedicated analyst channel.
- Data: the Liquipedia MediaWiki API (`src/esports/liquipedia.js`), query only, gzip, at most one request per 2
  seconds, User-Agent `HengsDiscordBot/<version> (+https://github.com/nugrahahenry/Hengs-Discord)`. One revisions
  request per check, page content only when a revision changed. Checks run every 20 minutes while a watched series
  is live and every 3 hours otherwise, and only once an analyst channel exists. A failed check waits like any other.
  Watchlist: MPL PH S18 Playoffs and MPL ID S18 Playoffs. International pages join when Liquipedia has them.
- Parser (`src/esports/wikitext.js`): `{{Match}}`/`{{Map}}` wikitext into series with teams (names and tickers learned
  from map comments), WIB start times (SGT, ICT and other listed zones), per game winner, sides, length, objective,
  picks, bans and VOD. Inconsistent results are invalid and never posted; unknown time zones are not posted.
- Card (`src/esports/card.js`): drawn by Hengs with the bundled Barlow fonts. It shows the score, every game, the
  MVP (or "belum ada di data Liquipedia") and up to two notes counted from the games: comeback, sweep, decider,
  a hero in every game, side record and longest game. There are no logos, hero art or photos. It uses
  `assets/esports/series-bg.png` when Henry adds it, otherwise the Aurora gradient.
- Posting (`src/esports/service.js`): only series that started in the last 36 hours, at most 3 per check. Each post
  is claimed on disk before the send (no automatic resend) and seeded with 🔥 🤔 ⚠️. For 72 hours Liquipedia
  corrections edit the card with "Diperbarui HH:MM WIB". A member's ⚠️ (Hengs' own seed excluded) sends the guild
  owner one DM with the card and source links.
- `/admin setup` > Analis MLBB: preview, then create or reuse `📊・hengs-analis` in the news category. The channel
  is read-only for @everyone (view, history, react). Hengs gets Pin Messages there only when the server already
  granted it. Setup then posts the pinned guide: coverage, timing, how to read the card, reactions, why no
  screenshots, accuracy. `assets/esports/guide-banner.png` goes on top when it exists.
- `fetchBounded` accepts `gzip: true`. The size cap then also applies to the decoded bytes. News callers are
  unchanged and still refuse compressed replies.

### Fixed

- The moderation test "panel maintenance keeps retrying until a private card is persisted" waited a fixed 80 ms
  and failed under a busy parallel run. It now waits until the panel is saved, up to 2 seconds.

### Verification

- Node 22 full suite 807/807 via PowerShell, twice in the default parallel mode and once with
  `--test-concurrency=1` (the VM's mode).
- Parser checked against one real Liquipedia API response (MPL PH and MPL ID S18 playoffs, 2026-10-23 18:04 WIB,
  1 request, kept outside the repo): every played PH series read correctly, including Team Falcons PH 3-2 Aurora
  Gaming PH in the upper bracket final.

## [1.71.0] - 2026-10-23

### Added

- One-tap meme votes. Hengs adds 😂 😐 💀 under every Hengs-made meme (the ones the taste store learns from),
  and the card says "Reaksi 😂 kalau lucu, 😐 kalau garing". On 2026-10-23 the taste store held 4 Hengs memes
  with 0 reactions, so nobody was voting unprompted. Seeding is best effort: a failed reaction logs
  `NEWS_MEME_REACT_FAILED` once and the meme stays posted.

### Changed

- Taste counts treat 😐 as a vote against: members' 😐 reactions subtract from the post's total, every other
  emoji adds, Hengs' own seeded reactions never count, and a post never goes below zero.

### Verification

- Node 22 full suite 779/779 via PowerShell.
- Deployed 2026-10-23 at Henry's request, dispatched 15:05 WIB after the 15:00 slot and accepted 15:09 with one
  controlled Discord restart. VM suite 779 total, 776 pass, 3 checkout-only skips, two fresh heartbeats, WhatsApp
  v0.53.0 and Canox untouched, news state unchanged, 14 home commands.

## [1.70.0] - 2026-10-21

### Added

- Hengs memes learn from reactions. Each posted Hengs meme is remembered (message, template, situation) in
  `data/meme-taste.json`; members' reactions are read back between 2 hours and 3 days after posting (Hengs'
  own reaction does not count) and then frozen into per-template and per-situation totals. Only counts are
  stored, never user IDs.
- The three best-liked templates are offered first in each writer call, the other three keep rotating; the
  first Hengs slot of the day reuses the best-liked situation unless it ran today or yesterday. Scores are
  reactions per post pulled towards the server average, so one lucky post does not take over. A missing or
  broken taste file, or a failed Discord read, never stops a meme.

### Verification

- Node 22 full suite 779/779 via PowerShell.
- Deployed 2026-10-21 20:41 WIB at Henry's request, before the 21:00 meme slot, with one controlled Discord
  restart: VM suite 779 total, 776 pass, 3 checkout-only skips, two fresh heartbeats, WhatsApp v0.53.0 and
  Canox untouched, news state unchanged, 14 home commands. The taste file starts empty and fills from the
  21:00 Hengs meme on.

## [1.69.0] - 2026-10-21

### Changed

- Hengs-made memes get 12 more templates in irony and twist formats: Forever Alone (the "still can't talk to
  people" shape Henry liked), Panik Kalm Panik, Expectation vs Reality, Midwit, Distracted Boyfriend, Hide the
  Pain Harold, Woman Yelling at Cat, Spider-Man pointing, None of my business, Success Kid, Bad Luck Brian and
  Roll Safe, each with an Indonesian worked example (28 templates). Ids and line meanings were checked against
  the memegen API on 2026-10-21.
- Template offers walk the whole ranked list by day and slot, six per writer call, so every format gets turns
  instead of the same top six every day.
- The writer asks for 5 options in formats that usually land ("Seumur hidup X, tetep nggak bisa Y",
  expectation vs reality, panik lalu kalm lalu panik, gw vs juga gw, simple vs overthought) with a twist in the
  last line. Groq budget 3000 tokens for writer and judge.
- The judge's humour bar rises to 8 (fit and language stay at 7): Henry would rather see an outside meme than a
  dry Hengs one.

### Verification

- Node 22 full suite 774/774 via PowerShell, including v1.68.0 (Coach phase 1, fast-forwarded from
  `coach-phase1`).
- Deployed 2026-10-21 17:09 WIB at Henry's request ("Deploy Discord v1.69.0 sekarang, di luar jam slot, plus
  daftar ulang command"), after the 17:00 meme slot, with one controlled Discord restart: VM suite 774 total,
  771 pass, 3 checkout-only skips, two fresh heartbeats, WhatsApp v0.52.0 and Canox untouched, news state
  unchanged. Commands re-registered: 14 home commands, /scrim with rekap and statku, /kirim present.

## [1.68.0] - 2026-10-21

### Added

- Hengs Coach phase 1, a scrim notebook for Hengs Family (MLBB). `/scrim rekap [lawan]` gives a private team recap:
  all games, the last 7 and 30 days, the last five results, loss reasons, the top five opponents and the last three
  notes. With `lawan` it becomes the memory before meeting the same opponent again. `/scrim statku` sends a player
  the numbers for games with them in the lineup, by DM only; a closed DM gets instructions, never the numbers.
- Every number reads "menang X dari N game". A percent appears from 5 games and "paling sering" from 5 losses; below
  that the text says there is not enough data. Loss reasons are labelled as team labels, not personal ratings.
- `lawan` autocomplete from opponents already logged, offered to Hengs Family members only.

### Changed

- `/scrim hasil` logs one game instead of one series: `lawan`, one `hasil` dropdown (Menang, or Kalah with the main
  reason: early game, objective, teamfight, draft, lainnya), optional `ss` and `catatan`. `skor`, `seri` and `game`
  are gone; the card shows today's running score against the same opponent (WIB). The private preview has a lineup
  select (up to five, prefilled with the last lineup members who still hold the role; other picks are ignored and
  counted).
- Games live in a new file, `data/scrim-games.json` (one row per game, lineup as Discord IDs, newest 500 per
  server). The v1.64 per-series `data/scrim-results.json` is no longer read or written; it was absent on the VM, so
  nothing migrates and a rollback keeps working.
- Help and `/hengs privacy` describe the notebook, the recap and DM-only player stats.

### Fixed (review before release)

- Preview and Kirim refuse when @everyone can view hasil-scrim, because cards now carry the lineup and team notes.
- A second Kirim click while the first is still posting answers "masih diproses" instead of claiming nothing was sent.
- Opponent and note cuts (input, recap notes, long replies) never end on half an emoji.
- `lawan` autocomplete reads the cached team role instead of a REST call per keystroke (3-second window).

### Verification

- Node 22 full suite in the worktree: 772 tests, 771 pass, 0 fail, 1 skip (the sibling-checkout runtime check,
  which only applies to the main checkout). No Discord, Groq or VM call. Not deployed; needs command
  re-registration.

## [1.67.0] - 2026-10-21

### Added

- `/kirim meme` (image plus optional caption) and `/kirim berita` (link plus optional note) in
  bot-commands. Same private preview and own confirmation as `bagikan`; Hengs posts it in the channel
  with "Dibagikan oleh <member>". Images must be PNG, JPG or WebP up to 8 MB from Discord's CDN, the
  bytes must match the declared type, and the vision model (the one used for outside memes) must
  answer exactly `{"safe":true}`. At send time the image is fetched again and must match the checked
  hash. Without a vision model, image submissions are refused.

### Changed

- News and meme channels are read-only for members: @everyone can view, read history and react, but
  cannot send or open threads; Hengs keeps view, send, attach and embed. The "News + memes" setup now
  applies this instead of opening member posting. Sharing no longer asks members for send permission
  in the destination.
- Hengs-made memes start only from 32 everyday situations (campus, MLBB, Valorant, Roblox, daily life),
  never from news headlines: a news topic had produced a Two Buttons meme choosing between "upgrade
  CPU" and "waiting for the deadline". Every template now carries a worked example, the writer prompt
  asks for one situation per meme, the exact template meaning and casual Indonesian, and the writer
  runs with medium reasoning.
- A second Groq call judges every option on fit, humour and language (1 to 10, temperature 0.2). Only
  an option with all three at 7 or more is posted; otherwise the slot falls back to an outside meme.
  The writer's own score is no longer used. Meme slots no longer read the news feeds.

### Verification

- Node 22 full suite 751/751 via PowerShell.
- Deployed 2026-10-21 at Henry's request ("deploy ... di luar jam slot, terus jadiin #hengs-news dan
  #hengs-memes read-only"), between the 15:00 meme and 16:00 news slots, with one controlled Discord
  restart: VM suite 751 total, 748 pass, 3 checkout-only skips, two fresh heartbeats, WhatsApp and Canox
  untouched, news state unchanged. Commands registered: 14 home commands including /kirim.
- Right after the deploy, the two live channels were made read-only (@everyone send and threads denied,
  view, history and reactions allowed; Hengs send, attach and embed allowed). Read back: members cannot
  send in either channel, Hengs can, and no other overwrite allows sending.

## [1.66.1] - 2026-10-21

### Fixed

- The public-address check used for feeds and images rejected all of 192.0.0.0/16, so feeds hosted on
  WordPress.com (192.0.64.0/18), such as Revival TV, never loaded (an older bug, carried into
  `src/news/http.js`). Only the special ranges 192.0.0.0/24 and 192.0.2.0/24 are rejected now.

### Operations

- 2026-10-21 05:18 WIB, Henry asked for the setup to be finished for him ("lanjutkan"): after a read-only
  dry run on the VM, the home guild schedule was set to 5 news (tech, AI, gaming; 08:00 to 16:00) and
  5 memes (13:00 to 21:00) with the store's revise transition (the same one `terapkan berita` uses,
  refused while a slot is due). Channels, tone and the enabled state did not change. The state file is
  schema 4 from now on.

### Verification

- Node 22 full suite 743/743 via PowerShell.
- Deployed 2026-10-21 05:33 WIB at Henry's request ("deploy aja sekarang"), before the 08:00 slot, with
  one controlled Discord restart: VM suite 743 total, 740 pass, 3 checkout-only skips, two fresh
  heartbeats, WhatsApp v0.50.0 and Canox untouched, news state unchanged, 13 home commands. Revival TV now
  loads (no fresh items yet), Jagat Play loads.

## [1.66.0] - 2026-10-21

### Added

- Five memes a day on their own clock: three made by Hengs (a popular template from the Imgflip ranking,
  an Indonesian caption written by Groq about a hot news topic or an everyday student/gamer theme,
  rendered by memegen.link and posted as an attachment) and two from outside (a new xkcd comic,
  otherwise a hot Lemmy programmer_humor post that passed a Groq vision safety check). If one kind is
  unavailable the other fills the slot; if both fail the slot stays empty. Daily caps: Hengs 5, Lemmy 3,
  xkcd 1. The Hengs slot at 17:00 (slot 2) always uses an everyday theme.
- `preview meme` shows one private sample of a Hengs meme (up to 6 per hour); nothing is sent or stored.
- Optional `GROQ_VISION_MODEL` (default `qwen/qwen3.8-27b`); without Groq, outside Lemmy memes are skipped.

### Fixed

- Two regular expressions from v1.65.0 (the prompt cleaner and the accent stripper) had their `\u`
  escapes written as the raw invisible characters. Behavior was the same; the source now uses escapes
  again, matching v1.64.2.

### Verification

- Offline only, synthetic data: Node 22 full suite 743/743 via PowerShell. No Groq call, Discord message
  or deploy. The read-only VM probe from v1.65.0 already confirmed memegen, Imgflip, Lemmy and the vision
  model from the VM.
- Deployed 2026-10-21 05:07 WIB (with v1.65.0) with one controlled Discord restart: VM suite 743 total,
  740 pass, 3 checkout-only skips, two fresh heartbeats, WhatsApp v0.50.0, Canox and news state unchanged,
  13 home commands. Read-only check afterwards: the runtime reads the live schedule as news 08:00 and 10:00
  plus a meme at 13:00, and the state file was not written.

## [1.65.0] - 2026-10-21

### Added

- Hengs News can send up to five news a day, one every two hours from the chosen time (the default stays
  three: 08:00, 10:00, 12:00 WIB). New sources: the Hacker News front page (tech and AI, linked to the HN
  discussion), CNN Indonesia, CNBC Indonesia, Liputan6, Okezone and ANTARA technology feeds, and Gamebrott,
  Jagat Play, Esportsnesia and Revival TV for gaming. Indonesian media cards carry no publisher images.
- Picks follow "heat": Hacker News points per hour, how many different publishers carry the same story
  within 12 hours, and a bonus when Google Trends Indonesia shows the topic rising. Each card says why it
  was picked. A story already sent is not sent again from another publisher; politics, SARA, crime,
  disasters, gambling and adult topics are skipped.
- Memes have their own count (0 to 5), clock (default 13:00) and channel:
  `atur berita meme 5 jam 13:00 ke #hengs-memes`. In this version meme slots use new xkcd comics only.

### Changed

- News slots are two hours apart (was one hour). The fixed "2 news + 1 meme" mix is gone:
  `atur berita 2 berita 1 meme` now means two news and one meme on separate clocks.
- News state schema 4 (separate news and meme receipts). Older state upgrades on read without writing;
  the rollback adapter pauses schedules an older runtime cannot follow. The live 3-item mix becomes news
  at 08:00 and 10:00 plus a meme at 13:00 until a manager changes it.

### Verification

- Offline only, synthetic data: Node 22 full suite 731/731 via PowerShell. Read-only VM probe: all 14 new
  hosts answered 200 with the expected types and article hosts; the Groq vision model is present and
  answered exactly {"safe":true}. No deploy.

## [1.64.2] - 2026-10-20

### Changed

- hasil-scrim is private to the team: `/admin setup` > Scrim tim now denies view, history, send, threads
  and reactions for @everyone, on a new channel and when it reuses an existing one, and its preview says
  so. Only Hengs Family and Hengs see the channel; Owner and Administrator roles still can. Henry asked
  for this because scrim results must not leak.

### Operations

- 2026-10-20 the live channel was locked the same way through the bot's REST identity before this
  release (only the @everyone overwrite changed; the team role and Hengs kept theirs).

### Verification

- Deployed 2026-10-21 02:48 WIB with one controlled Discord restart: VM suite 720 total, 717 pass,
  3 checkout-only skips, two fresh heartbeats, WhatsApp v0.50.0, Canox and news unchanged, 13 home
  commands. After the restart @everyone is still denied view, history and send in hasil-scrim.

## [1.64.1] - 2026-10-20

### Fixed

- `/scrim hasil` and `/admin setup` find the team role with or without an emoji prefix, for example
  `🫂 Hengs Family`, the same way the hasil-scrim channel was already matched. Two candidate roles still
  refuse instead of guessing. Before this, renaming the role would have made `/scrim hasil` report it
  missing.

### Operations

- 2026-10-20, at Henry's request, the five self-assign roles got their get-roles emoji in the name
  (`🐉 Mobile Legends`, `🎯 Valorant`, `🧱 Roblox`, `📢 Announcements`, `🎉 Events`) through the bot's REST
  identity. Reaction roles store IDs and `/admin getroles` matches names fuzzily, so nothing else changed.
  The server has no Boost level 2, so Discord role icons are unavailable; emoji stay in the names.

### Verification

- Deployed 2026-10-20 21:05 WIB with one controlled Discord restart: VM suite 720 total, 717 pass,
  3 checkout-only skips, two fresh heartbeats, WhatsApp v0.50.0, Canox and news unchanged, 13 home
  commands. The release tests were first rehearsed from the extracted archive without a .env file.

## [1.64.0] - 2026-10-19

### Added

- Hengs Discord v1.64.0 adds a scrim results channel. `/admin setup` gains **Scrim tim**: after a
  private preview and confirmation it creates (or reuses) the permissionless `Hengs Family` role and a
  `📸・hasil-scrim` channel under Gaming where everyone reads and only the team role and Hengs post.
- `/scrim hasil` lets a Hengs Family member submit a screenshot with opponent, score, result, game and
  note. Private preview, one-click send without pings, Discord nonce, no automatic retry. Each sent
  result is recorded in `data/scrim-results.json` (newest 500 per guild) for a future coach.
- Cloud rollout accepted 2026-10-20 together with v1.63.0: VM suite 716 pass / 3 checkout skips,
  two fresh heartbeats, WhatsApp and Canox unchanged, home commands re-registered. Casterin inactive
  until its Gemini key is installed. Scrim tim provisioned 2026-10-20 at Henry's request through the
  same setup code (role and channel, no restart); member submission not yet dogfooded.

### Security and privacy

- Only Discord CDN PNG/JPEG/WebP images up to 8 MB are downloaded once at send time; image bytes and
  URLs are not stored. Text fields drop control/format characters, angle brackets and `@`.
- Role membership, channel and bot permissions are re-checked at send time; duplicate role or channel
  names refuse instead of guessing. Role assignment stays manual.

## [1.63.0] - 2026-10-19

### Added

- Hengs Discord v1.63.0 adds Casterin: `/caster` in the home guild turns a short member moment into a
  fictional caster shout written by Groq `openai/gpt-oss-120b` and voiced by Gemini TTS
  `gemini-3.8-flash-tts`, falling back to `gemini-3.8-flash-lite-tts` on 429. Four fictional personas
  with fixed prebuilt voices; no voice cloning, no game footage, no files written.
- Private preview with Kirim/Ulang/Batal. Public posts carry "Suara AI, persona fiksi" and the requester
  without pings. Members use it in bot-commands through the existing channel guard.
- RAM limiter: `CASTER_DAILY_LIMIT` (default 20, UTC day so it resets 07:00 WIB with Google), 3 per
  member per day, 60 s member cooldown, 20 s per-model gap (free tier 3 RPM), one generate at a time,
  at most 10 drafts, 10 minute preview TTL. Groq refusals/failures spend no TTS quota. No auto retries.
- Member help and `/hengs privacy` describe the Casterin data flow (Groq, Gemini free tier).

### Operations

- Not deployed. Activation needs a dedicated Gemini API key in `/etc/hengs/discord.env`, home guild
  command registration and the manual checks in the Casterin spec.

## [1.62.0] - 2026-10-18

### Added

- Hengs Discord v1.62.0 splits scheduled news and entertainment destinations. Schema v3 adds
  `memeChannelId`; no meme route means skip, never post entertainment to news as fallback.
  Validated migration preserves delivery evidence. Rollback to schema v1/v2 pauses entertainment
  schedules, preserving receipts and preventing mixed-channel sends by an older runtime.
- Optional News + memes setup previews direct member posting permissions and only creates/reuses
  those channels. Fresh role/inventory gates, consumed confirmations, no automatic retry after
  partial or uncertain mutations. Does not change routing, start a schedule or run full setup.
- Private member self-sharing: explicit news links, text jokes or own Discord image-message links,
  RAM-only preview and same-author confirmation. Fresh source/target permissions, ownership,
  timeout, route binding, bounded cooldowns, mention/embed suppression and no retry after send
  uncertainty. Native slowmode channels require direct posting. No AI judge, queue or URL fetch.
- Member-first help explains native posting versus relay. Direct images remain native uploads;
  relay forwards a link, not media bytes. Existing scheduled quotas/spacing remain unchanged.

### Operations

- Cloud accepted on 2026-10-18 from exact code `86de70314dc8`: candidate Node22 QA 691 passed,
  zero failed, three expected checkout-only skips (694 total); local Node24 QA 694/694 passed.
  News schema2 upgraded atomically to3 under stopped Discord, preserving state/owner/mode and
  delivery evidence. One controlled restart passed two fresh advancing health heartbeats.
- WA and Canox unchanged; local bots remain off. Staging absent; schema-aware v1.61.0 rollback
  available and not needed. No live publication or channel change during this deployment.
- On 2026-10-19, owner UI limited setup opened both channels for direct member contributions.
  Distinct news/meme routing applied with active schedule and delivery history preserved. Both
  destinations moved to Announcements. Read-only permission audit and private joke preview/cancel
  passed, with no public test publication, redeployment or restart. Scheduled slots remain hourly;
  no fresh item means skip, not fabricated content or a guaranteed three-item daily delivery.

## [1.61.1] - 2026-10-18

### Fixed

- Hengs Discord v1.61.1 removes availability and missing-slot counters from News cards/previews.
  Entertainment-only cards use the Hengs Memes heading, with source/date and safety labels kept.
- Presentation-only patch; deployed with v1.62.0. No routing, schema, permission, source, daily
  quota or schedule changes in this patch; split routing and sharing were added in v1.62.0.

## [1.61.0] - 2026-10-17

### Added

- Hengs Discord v1.61.0: member-first help, Hall of Fame guidance toward bot-commands,
  and optional native member selection for appreciation notifications. Preview never pings;
  only owner-approved publication may notify up to eight explicitly selected server members.
- Selection is actor/editor/guild/revision bound, persists separately from free-text drafts,
  and is cleared by factual edits. Uncertain tagged sends stay held for review, not resent.

### Fixed

- Daily News sends one item per slot with a minimum one-hour gap instead of a three-item burst.
  Two news plus one entertainment remain available. Durable claims survive restarts and changes;
  missed windows are skipped. Legacy receipts consume the whole day after schema v2 migration.
- Appreciation rosters render as individual bullets, preserving canonical legacy draft text.
- Gallery prompts are redirected privately or ignored for public mentions. Ordinary help does
  not advertise owner-only controls as member capabilities.

### Operations

- Existing Hall post roster reformatted without changing poster/certificate, mentions or permissions.
  One guidance post pinned and channel topic points to bot-commands.
- Approved cloud deployment accepted after one controlled Discord restart and two fresh advancing
  health heartbeats. Node22 QA: 661 passed, zero failed, three checkout-only skips (664 total).
  WA and Canox unchanged; staging removed. News schema2 migrated atomically with legacy day guards.
  Rollback to v1.60.0 requires conservative day-coalescing downgrade before starting old code;
  never restore a stale receipt snapshot. No live news or member ping was sent for acceptance.
- Verified public installation link added to the application description, preserving all other
  application and installation settings. No administrator permission added.

## [1.60.0] - 2026-10-17

### Added

- Hengs Discord v1.60.0: poster Crown Stage memakai aset panggung, trofi dan turunan logo
  transparan yang disetujui owner. Font Barlow dan ikon Phosphor dibundel beserta lisensinya.
- Komposisi menyesuaikan logo, nama tim/turnamen panjang, pencapaian umum, tanggal opsional,
  serta 0-8 pemain. Nickname opsional; nama tidak dipotong. Teks lengkap tetap ada di embed.
- Edit apresiasi membuka form lima isian yang sudah terisi. Peminta, server, izin editor,
  status pending dan revisi terakhir diperiksa sebelum perubahan disimpan.

### Fixed

- Submit form lama tidak menimpa revisi baru. Jalur edit teks mentah tidak merusak template
  apresiasi, dan pembaruan preview yang kedaluwarsa dibatalkan sebelum pengiriman edit.
- Sheet preview offline menghitung tinggi dari semua gambar agar poster tidak terpotong.
- Tidak ada perubahan state/schema, provider, penerimaan sertifikat, deployment, atau
  pengumuman otomatis. Logo sumber tetap utuh dan bukan diganti oleh turunan transparannya.

## [1.59.0] - 2026-10-17

### Added

- Hengs Discord v1.59.0: kartu apresiasi dari fakta owner/editor melalui prompt atau formulir
  lima isian. Pemain maksimal delapan dengan nickname opsional; tanggal/hasil tidak ditebak.
- Kartu Hall of Fame memakai logo Hengs Family yang diberikan owner untuk penerima Hengs
  Familia/Family, atau trofi Canvas untuk penerima lain. Teks lengkap tetap ada di embed.
- Integrasi memakai draft announcement Ops yang sudah ada: review privat, edit, jadwal,
  owner-only publish, claim sebelum pengiriman dan recovery ID tetap dipertahankan. Tidak
  menambah database penghargaan, role, poin, channel, provider, atau auto-publication.
- Form memeriksa peminta, home guild dan akses editor saat callback. Input dibatasi, mention
  dimatikan, Markdown ditampilkan literal, dan kegagalan gambar menyisakan teks lengkap.

### Changed

- Welcome/leave menonjolkan nama tampilan member, memakai username asli sebagai handle,
  dan memberi ruang dua baris untuk caption. Preview offline desktop/mobile tersedia.
- Template apresiasi tidak ditulis ulang AI. Edit bebas yang keluar dari template menghapus
  lampiran lama agar gambar tidak membawa fakta usang. Format state tetap kompatibel rollback.
- Belum deploy atau mengirim apresiasi ke Discord; patch v1.58.1 dan v1.58.2 ikut checkpoint ini.

## [1.58.2] - 2026-10-17

### Fixed

- Welcome home tidak lagi menumpuk sapaan, daftar channel dan bantuan template lama di atas
  onboarding baru. Satu pembangun embed dipakai oleh jalur kartu dan fallback tanpa kartu.
- Panduan empat langkah lebih ringkas, link channel mendukung nama Indonesia dan Inggris,
  ID konfigurasi tetap didahulukan, dan channel non-text tidak dipilih sebagai tujuan.
- Kalimat bawaan pada kartu dipendekkan agar tidak memuat ulang seluruh panduan. Copy custom,
  auto-role, mention-off, state, aset, dan onboarding server publik tidak diubah.
- Checkpoint lokal, termasuk patch News v1.58.1 yang belum dideploy. Tidak mengedit welcome lama
  atau menerbitkan apresiasi/achievement; produksi terakhir terverifikasi tetap v1.58.0.

## [1.58.1] - 2026-10-16

### Fixed

- Editor Groq GPT-OSS 120B/20B memakai schema JSON ketat, reasoning rendah dan tanpa output
  reasoning. Provider/model lain tidak menerima parameter khusus Groq. Batas token/waktu,
  validasi hasil, cache, retry nol dan isolasi percakapan privat tidak berubah.
- Kegagalan provider dan parser tidak lagi semuanya menjadi fallback generik: kode aman
  membedakan akses, rate limit, timeout, request ditolak, provider, jawaban terpotong/kosong,
  JSON dan schema. Tidak mencatat raw error, reasoning, isi jawaban atau credential.
- Status produksi README diselaraskan ke v1.58.0. Patch v1.58.1 belum dideploy; probe kandidat
  dua cuplikan publik lolos validasi tanpa restart service atau kiriman Discord.

## [1.58.0] - 2026-10-16

### Added

- `terapkan berita` sesudah preview untuk merevisi topik/jam/jumlah/gaya di channel teruji,
  mempertahankan status aktif/jeda, receipt harian dan deduplikasi tanpa uji kirim ulang.
  Channel baru tetap perlu uji; revision/TTL/izin dan pengiriman in-flight dijaga.
- Komposisi maksimal dua berita + satu hiburan, parser `atur berita 2 berita 1 meme`,
  reservasi slot tanpa filler, berita lebih dulu dan jumlah nyata/kekurangan bahan di preview.
- Cloudflare Blog sebagai tambahan feed teknologi dengan URL/gambar allowlisted,
  pemeriksaan DNS publik, batas ukuran/waktu dan tanpa crawling atau unduh media.

### Changed

- Kartu hiburan memakai label/warna tersendiri. Komik tanpa cuplikan tidak dimasukkan ke AI;
  pemetaan ID rapat dan cache menjaga ringkasan artikel lain saat susunan campuran berubah.
- Bantuan menjelaskan ringkasan AI, fallback bahasa sumber, komik xkcd dan alur revisi baru.
  Schema1, batas satu kiriman per hari, permission, state privat dan anggaran model tetap.

### Deployment

- Deploy satu kali dari commit 69c196ca5ca9d0aabe82f5de553005ddd7108e9e diterima pada 2026-10-16.
  Lokal 627/627; kandidat Linux 624 pass/0 fail/3 skip khusus checkout. Dua heartbeat sehat,
  satu consumer, nol restart otomatis; auth/state dipertahankan dan rollback v1.57.0 tersedia.
- Preview privat nyata memilih dua berita dari Cloudflare/NVIDIA dan satu komik xkcd.
  Berita memakai fallback cuplikan asli yang dilabeli; bukan bukti keberhasilan editor Indonesia.
- `terapkan berita` mengaktifkan komposisi itu pada jadwal 08:00 WIB yang sudah aktif tanpa kiriman
  tambahan atau reset receipt. Audit health/state lulus; WA dan Canox tidak berubah.
  Pengiriman harian pertama masih belum teramati, tanpa automation Codex tambahan.

## [1.57.0] - 2026-10-16

### Added

- Judul dan ringkasan Indonesia dari judul/cuplikannya saja, dengan tone santai atau netral,
  label AI, sumber asli dan fallback cuplikan saat provider/output tidak dapat dipakai.
- Editor JSON terpisah dari percakapan/memori pribadi. Pemeriksaan ID/format/panjang, teks,
  sinyal bahasa dan angka baru; ini bukan jaminan kebenaran semantik atau bebas halusinasi.
- Request ke provider yang sudah dikonfigurasi dibatasi satu batch, timeout 8 detik, tanpa
  retry, satu in-flight, jeda 30 detik dan maksimal 12 percobaan/jam/proses. Cache RAM 10 menit.
- Maksimal satu artikel per penerbit, mengikuti topik, freshness dan deduplikasi yang sudah ada.
  Tidak memenuhi kuota dengan sumber duplikat atau berita basi jika pilihan lebih sedikit.
- Preview dan kiriman memakai salinan yang sama. Reset/revisi/pause/shutdown selama proses
  editor tetap membatalkan aksi lama. Ringkasan tidak masuk state atau backup persisten.

### Deployment

- Deploy terkontrol 2026-10-16 dari commit 3b9458f179b056fe1e571c659a9f914a426c0ecf diterima.
  Kandidat Node22 lulus 614 tes dengan 3 skip khusus checkout, setelah lokal 617/617 lulus.
  Dua heartbeat sehat bergerak, satu consumer dan nol restart otomatis; rollback v1.56.0 tersedia.
- Preview privat nyata di bot-commands menampilkan satu artikel baru dengan gambar, judul dan
  ringkasan Indonesia, label AI serta tautan sumber. Ini satu sampel berhasil, bukan jaminan
  akurasi seluruh output mendatang. Edisi publik lama tetap satu; jadwal harian tetap dijeda.
- Auth, state dan konfigurasi dipertahankan. WA dan Canox tidak direstart atau diubah;
  tanpa QR, backup, reboot, registrasi command atau resource cloud baru.
- Setelah review dan persetujuan lanjutan Henry, jadwal home guild diaktifkan pada 2026-10-16
  pukul 17:10 WIB melalui preview privat terbaru dan `aktifkan berita` di bot-commands.
  Teknologi + AI, 08:00 WIB, santai; audit state tested/active dan health lulus. Tidak ada kiriman
  publik tambahan, restart atau automation Codex baru. Pengiriman harian pertama belum teramati.

### Scope

- Tidak ada schema/dependency baru. Preview mengambil feed publik dan memakai provider yang
  sudah dikonfigurasi, tanpa mengirim chat atau memori privat ke editor berita.
- Judul/cuplikannya publik akan memakai kuota provider ketika kandidat dijalankan dengan
  konfigurasi yang tersedia. Batas per proses bukan batas biaya persisten.

## [1.56.0] - 2026-10-16

### Build

- Versi pembuat arsip mengikuti metadata checkpoint dan diverifikasi terhadap committed HEAD.
  Fixture packaging memakai versi produk aktif agar pengikat versi lama tidak lolos QA.

### Added

- Kartu Hengs News dengan gambar feed di atas judul, cuplikan, sumber dan tanggal WIB.
  Maksimal tiga artikel tetap dikirim sebagai satu pesan menggunakan komponen native Discord.
- Parser gambar RSS/Atom mendukung media thumbnail/content, enclosure gambar dan img di dalam
  feed. Hanya URL HTTPS raster pada domain/path penerbit yang diizinkan; tanpa crawling,
  unduhan gambar, penyimpanan media, model AI, atau dependency baru.
- Fallback teks beserta sumber saat gambar tidak tersedia/ditolak, alt text dan penanda komik.
  Preview privat memakai kartu yang sama; batas satu kiriman/hari dan receipt tidak berubah.

### Scope

- Implementasi lokal; cloud tetap v1.55.0 dan jadwal news tetap dijeda. Pengujian nyata edisi teks
  v1.55.0 telah berhasil satu kali. Tidak ada deployment, kiriman kedua atau aktivasi harian.
- Schema state tetap 1. Artikel/URL gambar hanya di cache/draft RAM, tidak masuk backup state.

## [1.55.0] - 2026-10-13

### Added

- `/admin setup` menanyakan apakah ingin menambahkan Hengs News, dilanjutkan preview privat
  dan konfirmasi. Pilihan belum sekarang/batal tidak menambah channel news.
- Tombol Tambah news saja membuat satu channel baca-saja tanpa menjalankan setup server lama.
  Channel news yang sudah ada digunakan tanpa rename, pemindahan, atau perubahan permission.
- Tiket terbatas 10 menit, terikat admin/server/channel, pemeriksaan ulang inventory/izin,
  satu proses setup per server, serta penolakan klik ulang dan hasil create yang tidak pasti.

### Scope

- Khusus alur admin server utama yang sudah ada; `/setup` publik dan schema slash command tetap.
  Tidak mengaktifkan atau menimpa pengaturan news, mengambil feed, mengirim berita, atau deploy.
  Setup lengkap tetap terpisah dan menjelaskan perubahan template lama sebelum konfirmasi.

## [1.54.0] - 2026-10-13

### Added

- Hengs News: draft, revisi topik/jam/gaya, preview privat, simpan dalam keadaan jeda,
  kiriman uji, aktivasi harian, status dan pause lewat `/hengs ask` yang sudah ada.
- Preset teknologi, AI, gaming dan hiburan/komik dari feed HTTPS terpilih. Maksimal tiga item,
  cuplikan singkat dengan sumber/tanggal, tanpa AI, media scraping, atau biaya model tambahan.
- Jadwal WIB, deduplikasi URL, receipt sebelum pengiriman, nonce Discord, konfirmasi yang
  kedaluwarsa dan terikat pemanggil/server/channel, serta penyimpanan atomik per guild.
- State news masuk validasi snapshot/restore Discord. Tidak ada perubahan schema state lama.

### Safety and scope

- Owner/Administrator only; channel dan izin diperiksa saat mengirim. Tidak membuat channel,
  mengirim mention massal, mengakses chat/memori privat, atau menerima URL feed bebas.
- Feed dibatasi ukuran/waktu, redirect dan alamat privat ditolak, isi sumber tidak mengeksekusi
  instruksi, dan hasil pengiriman tidak pasti tidak dicoba ulang otomatis.
- Deployed melalui restart terkontrol pada 2026-10-13. Tes Node22: 568 pass, nol gagal,
  tiga kasus khusus checkout lulus di laptop. Dua heartbeat sehat; WA dan Canox tidak direstart.
  Belum ada kiriman berita Discord atau jadwal produksi aktif. Rollback v1.53.0 tersedia.

## [1.53.0] - 2026-10-11

### Added

- Welcome dan Leave Card mendapat bevel statis pada avatar, badge onboarding, dan panel statistik:
  bayangan offset, highlight tepi, serta shading avatar membuat material 3D terasa lebih nyata.

### Scope

- Local-only checkpoint. Tidak ada perubahan copy, onboarding flow, schema, provider call, token,
  atau mutasi cloud. Motion tetap ditunda sampai kebutuhan animasi sudah jelas.

## [1.52.0] - 2026-10-11

### Added

- Welcome dan Leave Card mendapat depth layer statis: lantai perspektif, pantulan kaca, dan
  highlight orb untuk rasa 3D yang lebih kuat tanpa menambah aset eksternal.
- Badge onboarding tetap aman untuk nama display panjang, dan copy multiline dipadatkan saat
  handle display ikut tampil agar layout tidak bertabrakan.

### Scope

- Local-only checkpoint. Motion atau animasi frame belum diaktifkan agar pengiriman PNG tetap
  ringan dan stabil. Tidak ada schema baru, token change, provider call, atau mutasi cloud.

## [1.51.0] - 2026-10-11

### Added

- Welcome Card v2 menampilkan custom welcome copy di kartu, badge onboarding, judul yang lebih jelas,
  footer konteks, dan field onboarding terstruktur.
- Home onboarding memberi urutan rules, role, intro, pengumuman, serta jalur mention Hengs.
- Public onboarding menampilkan langkah awal setup dalam urutan singkat.

### Scope

- Local-only checkpoint. Cloud tetap di release produksi yang diterima sampai approval deploy batch.
  Tidak ada schema baru, token change, QR, provider call, atau mutasi cloud.

## [1.50.0] - 2026-10-10

### Added

- Community Builder menampilkan tiga tema preview tetap: Aurora neon, Midnight gelap, dan Minimal
  bersih.
- Owner dapat memilih text lengkap, text inti, atau tanpa text, serta jumlah voice room yang
  tersedia untuk area terpilih. Tema, pilihan area, cakupan channel, gaya nama, dan revisi bounded
  tersimpan hanya di ticket preview privat sampai owner menekan Apply. Tidak ada schema state baru
  atau provider call.

### Scope

- Local-only checkpoint. Cloud tetap di release produksi yang diterima sampai ada approval deploy
  terpisah. Tidak ada token change, QR, atau mutasi cloud.

## [1.49.0] - 2026-10-10

### Added

- Owner atau Administrator home guild dapat mengubah, melihat, atau mematikan welcome custom
  melalui `/hengs ask` secara privat.
- Reset welcome menghapus hanya state welcome yang tervalidasi dan kembali ke copy bawaan Hengs.

### Scope

- Local-only checkpoint. Cloud tetap di release produksi yang diterima sampai ada approval deploy
  terpisah. Tidak ada provider call, token change, QR, atau mutasi cloud.

## [1.48.0] - 2026-10-10

### Added

- A confirmed home-guild welcome copy is stored in a bounded, atomic state file and reused by the
  member-join welcome card on later joins.
- The state is guild-scoped, rejects mentions, links, controls, and oversized text, and falls back
  to the existing fixed welcome copy when the state is missing or invalid.

### Scope

- Local-only checkpoint. Cloud remains on the accepted production release until a separate deploy
  approval. No provider call, token change, QR, or cloud mutation was performed.

## [1.47.0] - 2026-10-10

### Added

- Owner-confirmed community Apply can post a bounded custom welcome copy once to the lobby's
  welcome channel after the private review flow.
- Welcome copy uses disabled mentions and fails closed when the target channel cannot receive
  messages. Existing channels remain create-only and are never renamed, moved, or deleted.

### Scope

- Local-only checkpoint. Cloud remains on the accepted production release until a separate deploy
  approval. No provider call, token change, state migration, Canox change, or cloud mutation was
  performed.

## [1.46.0] - 2026-10-09

### Added

- Owner community prompts can select explicit options 1 through 4 and submit bounded quoted
  revisions for known category or channel names before the private preview.
- Revisions flow consistently through text preview, visual preview, review confirmation, and the
  create-only apply plan. Existing channels are never renamed, moved, deleted, or permission-mutated.
- Optional welcome copy is shown as a draft only in this earlier checkpoint. Activation is added
  in v1.47.0 after the same private review and owner Apply gate.

### Scope

- Local-only checkpoint. Cloud remains on the accepted production release until a separate deploy
  approval. No provider call, token change, state migration, Canox change, or Discord mutation was
  performed.

## [1.44.0] - 2026-10-08

### Added

- Default-off consent-scoped Canox memory for the exact configured owner, home guild and ephemeral
  `/hengs ask` only; preview/correction/confirmation, memory-only list/edit/disable/confirmed trash.
- Bounded approved context and revision recheck; consent loss/unavailability/reset clears private
  derived RAM and rejects late output. Public mentions, other users and administrators are excluded.
- Dedicated capability client with HTTPS/loopback restrictions, bounded responses and no retries.
  No ordinary-note promotion, model training, new deployment, provider registration or secret transfer.

## [1.43.0] - 2026-10-08

### Added

- Bounded RAM context: private 64 entries/48,000 characters, shared 24/24,000; six-hour expiry.
  Requests select recent complete exchanges plus older lexically relevant topics within separate
  24-entry/16,000 and 16-entry/10,000 character limits. Guild/user/private/public isolation remains.
- Private personal/focus/operations replies add minimal allowlisted feature/status receipts, not
  original input, note/reminder bodies, lists or identifiers. RESPONDED is not a success claim.

### Fixed

- "Ada lagi?" stays with ordinary chat unless a personal request is waiting. Actual `/hengs ask`
  wiring now routes time/confirmation continuations to the proper caller-scoped pending request.
- Discussion, negation and quoted commands no longer become personal writes. Reset clears pending
  requests and invalidates late chat/feature receipts, without undoing stored notes/reminders.
- Home/public prompts follow recent context/corrections and optional contextual humor without
  generic menus, forced laughter, unsupported action/status claims or permanent-learning claims.
- Code formatting is preserved, long dashes are removed and chat failure logs omit raw provider errors.

### Scope

- Local batch only. Production remains accepted v1.42.0; no deployment, service restart, token,
  state migration, command registration, provider call, durable learning or Canox change occurred.
  Offline fixtures prove routing/context plumbing, not the quality of every live model answer.

### Verification

- Isolated Node 22.23.3 suite passed 520/520, 0 skip, in serial mode. Actual command fixtures cover
  missing time, note confirmation, ordinary continuation, reset during await and role/surface gates.
- JS/shell syntax, LF, whitespace, privacy and new-long-dash checks passed. A parallel run hit an
  existing moderation retry test's fixed 80 ms wait; moderation code/test was not changed to mask it.

## [1.42.0] - 2026-10-04

### Added

- `/hengs ask` menampilkan status `Hengs sedang menyusun jawaban` sebelum hasil akhir, tetap mengikuti
  visibilitas privat atau publik yang dipilih interaction.
- Mention memperbarui typing indicator secara bounded selama provider fallback dan menghentikannya setelah
  jawaban atau error selesai.

### Fixed

- Prompt home dan public mempertegas bahwa Hengs adalah bot, bukan Henry, tidak boleh mengklaim tindakan
  yang belum terjadi, dan harus memakai konteks saat menjawab pertanyaan lanjutan.
- Progress copy dan typing path tidak menerima mention atau konten dinamis dari pengguna.

### Verification

- Test terarah lulus `28/28` dan suite penuh lulus `509/509`.
- Deployment terkontrol v1.42.0 lulus dengan service active/enabled, dua heartbeat
  `CONNECTED/OK/fresh`, satu MainPID Node, staging bersih, dan nol consumer Discord lokal. Token,
  auth, state persisten, dan WhatsApp tidak disentuh.

## [1.41.0] - 2026-10-03

### Fixed

- `/hengs ask` privat dan mention publik sekarang memakai konteks percakapan terpisah per guild dan user.
- `/hengs reset` menghapus kedua konteks, membatalkan jawaban AI yang masih berjalan, dan menjaga cooldown
  bersama agar perpindahan visibilitas tidak menjadi jalan pintas.
- Memori percakapan tetap RAM-only, dibatasi, dan tidak menambah database, schema, provider, token, atau
  state persisten baru.

### Verification

- Test terarah membuktikan isolasi privat dan publik, reset caller-only, stale in-flight guard, batas sepuluh
  pesan, validasi visibilitas, dan isolasi antar server.
- Deployment terkontrol v1.41.0 lulus dengan service active/enabled, dua heartbeat
  `CONNECTED/OK/fresh`, satu MainPID Node, staging bersih, dan nol consumer Discord lokal.
  Token, auth, state persisten, dan WhatsApp tidak disentuh.

## [1.40.0] - 2026-10-03

### Fixed

- `/hengs ask` pada server utama sekarang menahan balasan LLM sebagai ephemeral sehingga pertanyaan
  dan jawaban privat tidak muncul di channel.
- Prompt percakapan privat memakai identitas Hengs secara konsisten dan tetap melarang em dash serta
  en dash.

### Verification

- Test command membuktikan scope home memakai flag ephemeral, sedangkan scope public tetap memakai
  jalur balasan publik dan guard penggunaan yang sama.
- Deployment terkontrol ke cloud lulus dengan service active/enabled, dua heartbeat
  `CONNECTED/OK/fresh`, satu MainPID Node, dan nol consumer Discord lokal. Token, auth, dan state
  persisten dipertahankan; v1.39.1 tetap tersedia sebagai rollback.

## [1.39.1] - 2026-10-03

### Fixed

- Deployer Linux sekarang menerima dan memvalidasi release v1.39.1, bukan gate versi lama.
- Metadata package, lockfile, release builder, dan regression test disinkronkan.

### Verification

- Archive v1.39.1 terpasang di VM dengan checksum cocok. Service sengaja tetap `inactive/disabled`,
  proses cloud nol, dan seluruh file transfer sementara sudah dibersihkan.
- Setelah approval cutover, service v1.39.1 aktif/enabled dengan dua heartbeat `CONNECTED/OK/fresh`,
  satu main PID cloud, dan nol proses Discord lokal. Dogfood Canox project card menghasilkan satu
  draft `project` pending di Ops Hub tanpa publish otomatis.

## [1.39.0] - 2026-10-03

### Added

- Canox dapat mengirim kartu tugas proyek melalui inbox Ops Hub lokal.
- Discord mempertahankan `kind=project` sebagai label kartu privat tanpa publish otomatis.
- Payload announcement lama tetap kompatibel dan jenis draft dibatasi secara eksplisit.

## [1.38.0] - 2026-10-03

### Added

- Prompt `tugas proyek`, `rencana proyek`, dan `backlog proyek` membuat kartu tugas privat di Ops Hub.
- Kartu tugas memakai editor bounded, fallback lokal, dan approval yang sama dengan draft operasi.
- State draft lama tetap kompatibel karena `kind` hanya menerima `announcement` atau `project`.

## [1.37.0] - 2026-10-03

### Added

- `/hengs ask` kini mendukung catatan pribadi dan pengingat satu kali dengan bahasa natural.
- Catatan menunggu preview dan konfirmasi. Pengingat yang belum punya jam meminta follow-up, lalu
  dikirim satu kali melalui DM owner.

### Security

- Jalur personal hanya aktif untuk owner atau Administrator di home guild dan selalu ephemeral.
  Mention publik, member biasa, dan server publik tidak boleh menulis state pribadi.
- State dibatasi per guild dan user, ditulis atomik, tanpa provider AI baru, dan scheduler membatasi
  percobaan pengiriman serta memulihkan pengiriman yang tertahan.

### Verification

- Suite lokal penuh lulus 496/496. Acceptance release di VM lulus 493 test dengan 3 skip dan 0
  failure. Cloud sekarang v1.37.0 active/enabled dengan dua heartbeat `CONNECTED/OK/fresh`.
- Deploy tidak mengubah token, auth, state lama, VM, atau WA. Archive, checksum, deployer sementara,
  dan staging remote sudah dibersihkan setelah acceptance.

## [1.36.0] - 2026-10-02

### Added

- Prompt owner atau editor Ops Hub seperti `lihat status draft` kini menampilkan ringkasan bounded
  dari jumlah draft dan event aktif secara privat.

### Security

- Status operasi hanya membaca store yang sudah ada, tidak menampilkan isi draft, tidak membuat
  draft baru, dan tidak memiliki jalur publish atau scheduler baru.

### Verification

- Focused prompt operation, prompt assistant, dan command tests pass. Cloud tetap v1.35.0 sampai
  deployment berikutnya disetujui.

## [1.35.0] - 2026-10-02

### Added

- Prompt natural untuk pengumuman, update proyek, event, dan reminder kini masuk ke draft privat
  Ops Hub atau Event Hub yang sudah ada.
- Prompt event menerima waktu WIB eksplisit dalam format `HH:mm` atau `YYYY-MM-DD HH:mm`.

### Security

- Parser operation bersifat deterministik, bounded, dan hanya aktif di home guild untuk owner atau
  editor Ops Hub. Tidak ada scheduler, database, atau Discord write baru.
- Draft tetap menunggu review panel dan keputusan owner. Waktu relatif seperti "besok" tidak ditebak
  dan meminta klarifikasi.

### Verification

- Full local suite passes 487/487. Cloud tetap v1.28.0; belum ada deploy, restart, command
  registration, atau dogfooding live.

## [1.34.0] - 2026-10-02

### Added

- Community preview tickets now offer an optional private PNG card alongside the text tree.
- The card uses the existing Canvas runtime and marks fixed text and voice channels as already
  available or still suggested.

### Security

- The image is generated locally from the same allowlisted blueprint and inventory fingerprint.
  It contains no prompt, guild ID, channel ID, member data, or provider output.

### Verification

- Preview-card, prompt-review, apply, and cloud-release tests pass locally. Cloud remains v1.28.0;
  no deployment or live Discord mutation was performed.

## [1.33.0] - 2026-10-02

### Added

- Owner confirmation now has a separate apply step for community blueprints.
- The executor can create only missing fixed text and voice channels, with a bounded maximum of
  24 creates per ticket.

### Security

- Apply is home-owner-only, fingerprint-bound, permission-checked, create-only, and protected by
  a per-guild in-memory lock. It cannot rename, delete, move, create categories, change roles or
  permissions, send messages, or accept arbitrary channel names.
- Stale, partial, failed, or unavailable applies consume the ticket and never retry automatically.

### Verification

- Prompt, review, apply, and cloud-release tests pass locally. Cloud remains v1.28.0 and no live
  Discord mutation or deployment was performed.

## [1.32.0] - 2026-10-02

### Added

- Community planning prompts that lack enough detail now ask three bounded preference questions
  before producing a preview.
- Community previews now show a tree with separate text and voice channels, including existing
  versus suggested markers.

### Security

- The new flow remains provider-free and read-only. It stores no answers or prompts, performs no
  Discord mutation, and keeps the existing owner or Administrator gate and private review ticket.

### Verification

- Focused prompt and preview tests pass. Cloud remains v1.28.0 and no command registration,
  deployment, or live Discord change was performed.

## [1.31.0] - 2026-10-01

### Added
- Prompt fokus natural untuk owner atau Administrator: belajar, scrim, status, dan handback.
- Prompt fokus memakai state mode yang sama dengan `/study` dan `/scrim`, tanpa provider AI atau
  mutasi channel, role, permission, maupun pesan.

### Security
- Prompt fokus hanya aktif di home scope dengan pemeriksaan owner atau Administrator. Pertanyaan,
  negasi, jadwal, durasi, dan pilihan mode ganda tidak mengubah state.

### Verification
- Fokus prompt, permission, dan state action tests lulus. Cloud tetap v1.28.0; belum ada deploy,
  restart, registrasi command, atau mutasi Discord.

## [1.30.0] - 2026-09-30

### Added
- Preview privat berbasis tombol untuk prompt rancangan komunitas.
- Ticket RAM-only dengan TTL lima menit, fingerprint inventory, batas kapasitas, dan aksi satu kali.
- Review ulang, batalkan, dan konfirmasi owner yang tetap belum menerapkan perubahan server.

### Security
- Setiap komponen memeriksa ulang sumber pesan bot, guild, channel, scope home, requester, owner,
  expiry, dan perubahan inventory. Channel yang tidak terlihat bot tidak dihitung.
- Administrator dapat meminta preview tetapi tidak dapat mengonfirmasi. Tidak ada state persisten,
  prompt mentah, provider call, arbitrary Discord API action, atau fallback publik.

### Verification
- Cloud tetap v1.28.0. Belum ada deployment, restart, registrasi command, atau mutasi Discord.

## [1.29.0] - 2026-09-30

### Added
- Prompt-first Community Assistant untuk mention Hengs dan `/hengs ask`.
- Prompt bantuan dan prompt rancangan struktur komunitas memakai blueprint deterministik untuk
  lobi masuk, server core, area gaming, dan creator studio.
- Blueprint menandai channel yang sudah ada tanpa menyimpan state baru atau mengirim prompt ke
  provider AI.

### Security
- Rancangan struktur hanya tersedia di home guild untuk pemilik server atau Administrator.
- v1.29.0 tidak membuat, menghapus, atau mengubah channel, kategori, role, permission, atau pesan.
- Prompt biasa tetap mengikuti rate limit, history, dan policy provider yang sudah ada.

### Verification
- Fokus prompt assistant dan routing command lulus 19/19.
- Cloud tetap v1.28.0. Belum ada deployment, restart, registrasi command, atau mutasi Discord.

## [1.28.0] - 2026-08-25

### Added
- The private Control Center now opens one Settings panel with fixed reply-style and language
  selects, one chat-channel picker, one Community Pack channel picker, All Channels, Turn Off
  Community Pack, and Back actions.
- Every successful selection re-renders the current validated settings with one fixed confirmation
  notice. Existing slash commands remain available as equivalent controls.

### Changed
- The active dashboard replaces Select Channel Again with Settings. The legacy v1.27.0 Repair
  component remains safely accepted during its short interaction lifetime and opens Settings.
- Chat-channel health and selection require View Channel, Send Messages, and Read Message History.
  Attach Files remains a separate Community Pack requirement.
- v1.28.0 does not change slash-command schema, so the combined deployment still needs only the one
  `/setup dashboard` registration introduced by v1.27.0.

### Security
- Every select and button rechecks fresh public-guild scope plus owner or Administrator access.
- Style and language accept only existing enums. Channel pickers require exactly one current-guild
  text or announcement channel selected through Discord, never typed IDs or channel names.
- Each action invokes one existing atomic schema 4 setter. Invalid values, cardinality, channel
  type, ownership, or permissions leave configuration unchanged with no fallback or partial preset.
- Settings add no persistent field, component session, member data, content, secret, or AI call.

### Verification
- Focused Settings, routing, and release verification passes 56/56. The complete local suite passes
  456/456, production dependency audit reports 0 vulnerability, and runtime source contains no em
  dash or en dash.

### Operations
- Immutable v1.28.0 is live as the only Discord token consumer. Two advancing healthy heartbeats,
  one cloud Discord process, zero service restarts, zero local bot processes, and clean staging
  passed acceptance. Persistent state and the configured Anti-Raid mode were preserved.
- One valid command registration completed after runtime health acceptance. Read-only audit confirms
  two global commands, 12 home-guild commands, and the exact `/setup dashboard` schema.
- WhatsApp remained active/enabled as exactly one cloud process. Deployment did not restart WA,
  change WA auth, reboot the VM, start a local bot, or activate a public guild.
- Commit `21c5bdd` remains local because the existing GitHub CLI credential is invalid. Cloud
  deployment used its checksum-verified immutable archive; publication to `origin/main` is pending.

## [1.27.0] - 2026-08-25

### Added
- `/setup dashboard` opens one private Community Control Center for pending or active public guilds.
- Active panels show fixed setup status, language, style, channel scope, Community Pack state,
  seven-day usage, trend, and configuration health without exposing channel IDs or names.
- Exact buttons provide refresh, channel repair through the existing picker, private welcome-card
  preview, aggregate Owner Insights, and confirmed disable actions.

### Changed
- `/setup disable` now opens the same two-step confirmation used by the dashboard instead of
  deleting configuration immediately.
- The global `/setup` schema adds one `dashboard` subcommand. The combined v1.26.0 and v1.27.0
  deployment therefore requires one command registration after health acceptance.

### Security
- Every dashboard click rechecks the current guild scope and owner or Administrator permission.
- Components accept only exact allowlisted IDs. Refresh and cancel are read-only, Repair does not
  write before a valid channel selection, and Preview cannot publish or mention a member.
- Confirm Disable purges aggregate Owner Insights before removing the exact guild config. Purge
  failure preserves the config and returns only fixed privacy-safe copy.
- The dashboard adds no persistent state, session identifier, member data, chat content, or AI call.

### Verification
- Focused Control Center, routing, and release verification passes 50/50. The complete local suite
  passes 449/449, production dependency audit reports 0 vulnerability, and runtime source contains
  no em dash or en dash.

## [1.26.0] - 2026-08-25

### Added
- `/setup start` now opens a private Discord channel picker. One selection applies the fixed Hengs
  Standard preset with balanced replies, automatic language, current-channel scope, and Community
  Pack enabled in the same channel.
- Owner Insights compares the latest seven UTC days with the preceding seven days and reports a
  fixed new, up, down, or steady trend.
- Owner Insights checks configured chat and Community Pack channels at read time and reports fixed
  permission or availability issues without exposing channel IDs or names.

### Security
- Wizard completion rechecks owner or Administrator access, fresh guild scope, active-guild
  capacity, one-channel cardinality, current-guild ownership, channel type, and four required bot
  permissions before any write.
- Hengs Standard is a static public mapping. It never reads or copies home-guild settings, IDs,
  roles, channels, prompts, history, or member data.
- Preset activation uses one atomic schema 4 write. Trend and configuration-health fields are
  calculated from existing state and are not persisted.

### Changed
- Reopening `/setup start` is read-only until a channel is selected. Reapplying an exact preset is
  idempotent, while applying it after customization clearly replaces only the four public settings.
- Setup guidance no longer asks a friend to find Server ID or Channel ID.

### Verification
- Focused guided-setup, config-store, insights, routing, and release verification passes 55/55.
- The complete local suite passes 438/438. Deployment and Discord registration remain pending
  separate authorization.

## [1.25.0] - 2026-08-24

### Added
- `/setup welcome` lets a public server owner or Administrator preview the Aurora card privately,
  enable welcome and leave cards in the current channel, or disable them without manual IDs.
- Owner Insights now reports active days, average requests per active day, the busiest aggregate
  day, feedback coverage, helpful rate, and up to two deterministic recommendations.

### Security
- Community Pack is disabled by default for new and migrated guilds. It requires View Channel,
  Send Messages, and Attach Files, targets only the configured channel, and never falls back.
- New public invite links request Attach Files in addition to the existing minimal chat permissions
  so Community Pack can render its selected channel card.
- Public member events cannot run home-only auto-role, stats, moderation, or private welcome copy.
- Richer insights are calculated from the existing schema 1 aggregate buckets. No chat content,
  answer, member identity, channel identity, or new persistent field is collected.

### Changed
- Guild config schema 4 adds only the Community Pack enabled flag and selected channel ID. Schemas
  1 through 3 remain readable and migrate on an authorized write with Community Pack disabled.
- Public setup status now shows whether Community Pack is active.

### Operations
- Immutable v1.25.0 is live as the only Discord token consumer. Command registration ran exactly
  once after health acceptance. Read-only audit confirms two global commands, 12 home-guild
  commands, and the exact `/setup welcome` actions.
- Community Pack remains opt-in. Deployment did not enable it or mutate any public guild.

### Verification
- The complete suite passes 429/429 on local Node 24.15.0. Syntax checks pass for 111 JavaScript
  files and four Linux shell files, whitespace checks pass, runtime source contains no em dash or
  en dash, and the production dependency audit reports 0 vulnerabilities.
- Production acceptance passed two advancing `CONNECTED`/`OK`/fresh heartbeats with exactly one
  Discord process and zero service restarts. WhatsApp v0.20.3 remained healthy and unchanged,
  both local bots remained stopped, and release staging plus transfer residue were clean.

## [1.24.0] - 2026-08-23

### Added
- Welcome and leave cards now combine a reusable ImageGen aurora background with deterministic
  Canvas glass, avatar, identity, statistics, member-number, and border layers.
- The optimized production background is exactly 900 x 280, while the high-resolution source is
  retained separately for future crops and visual revisions.

### Fixed
- Short member tenure no longer displays `0d`. It now keeps useful minute and hour precision, such
  as `8m`, `2h 5m`, or `1d 2h`. Missing Discord join timestamps display `Unknown` instead of a
  fabricated duration.
- The visible welcome copy and all remaining runtime source now avoid em dash and en dash. A global
  regression test prevents either character from returning.

### Verification
- Focused visual, runtime-copy, and release tests pass 29/29. The full suite passes 421/421 on
  local Node 24.15.0. All 109 JavaScript files and four shell scripts pass syntax checks, the
  production dependency audit reports 0 vulnerabilities, and whitespace checks pass. Both PNG
  assets contain no textual or EXIF metadata. Exact Node 22 remains mandatory before deployment.
- No deployment, command registration, service restart, Discord write, or cloud mutation occurred.

## [1.23.0] - 2026-08-23

### Added
- `/setup insights` gives a public server owner or Administrator a private 7-day or 30-day
  summary of accepted requests, temporary limits, daily limits, and response feedback.
- Public AI answers now include requester-only `Membantu` and `Kurang pas` buttons. Each answer
  accepts one feedback choice and removes its buttons after the choice is recorded.
- A persistent per-guild daily request budget defaults to 100 accepted requests per UTC day. An
  operator may set a value from 10 to 300 with `HENGS_PUBLIC_DAILY_REQUEST_LIMIT`.

### Security
- Owner Insights stores daily integer aggregates and random request IDs only. It does not persist
  prompts, answers, usernames, display names, channel data, or per-member metrics.
- State uses strict schema validation, tenant-bound paths, symlink rejection, atomic writes,
  31-day retention, and fixed-code errors. A failed budget write blocks the provider call.
- `/setup disable` removes Owner Insights before removing the guild config and fails closed if the
  privacy purge cannot finish.

### Verification
- Focused Owner Insights and routing tests pass 48/48. The full suite passes 417/417 on local Node
  24.15.0, all 109 JavaScript files and four shell scripts pass syntax validation, the production
  dependency audit reports 0 vulnerabilities, and whitespace plus tracked-content checks pass.
  Exact Node 22 acceptance remains mandatory before deployment.
- No deployment, command registration, invite installation, service restart, Discord write, or
  cloud mutation occurred in this checkpoint.

## [1.22.0] - 2026-08-23

### Added
- `/hengs invite` gives any member a private self-service link for adding Hengs to another server
  they manage. It reuses the existing fixed Discord OAuth contract and minimum permissions.
- `/hengs privacy` explains AI-provider processing, in-process memory of at most 10 recent
  messages per user and server, caller-only reset, non-persistent chat history, and removable
  server configuration.

### Changed
- `/hengs help` now gives separate first-use guidance for members and server managers, including
  direct routes to setup, privacy, and invitation.
- The one-time public welcome includes the privacy command before the server is activated.

### Security
- Invite and privacy responses are private, mention-safe, and available without reading guild
  configuration or calling an AI provider. The invitation accepts only a validated application
  ID and always uses Discord's fixed domain, scopes, and existing minimum permission set.
- Invalid invite configuration produces one fixed error code without exposing identifiers or raw
  configuration. Unexpected failures from either public command also use one fixed outer error
  code. The generated URL never contains the bot token.

### Verification
- Focused command, onboarding, invite, and release tests pass 24/24. The full suite passes 397/397
  on local Node 24.15.0, all 105 JavaScript files and four shell scripts pass syntax validation,
  the production dependency audit reports 0 vulnerabilities, and whitespace plus release-content
  checks pass. Exact Node 22 acceptance remains mandatory before deployment.
- No deployment, command registration, invite installation, service restart, Discord write, or
  cloud mutation occurred in this checkpoint.

## [1.21.0] - 2026-08-23

### Added
- `/hengs ask`, `/hengs reset`, and `/hengs help` provide one simple public AI command, a
  caller-only memory reset, and fixed onboarding guidance.
- `/setup language` offers Auto, Indonesian, and English presets. `/setup channel` lets an owner or
  Administrator allow every channel or select the current channel without entering an ID.
- `/setup status` now summarizes reply style, language, and channel scope without exposing stored
  Discord IDs.

### Changed
- Public guild config schema 3 stores fixed language and channel settings. Schemas 1 and 2 remain
  readable and migrate atomically only on an authorized write.
- Public mention chat and `/hengs ask` share the same per-guild concurrency and rolling-window
  traffic guard. Both honor the selected channel and static language instruction.
- Command registration plans exactly two global commands, `/setup` and `/hengs`, while every legacy
  command remains scoped to the home guild.

### Security
- AI prompts are bounded user data, every AI response disables mentions, and custom language,
  custom system prompts, arbitrary channel IDs, cross-user reset targets, and cross-guild history
  are not accepted.
- Channel checks happen before traffic admission. Invalid config, IDs, permissions, and settings
  fail closed without entering provider or legacy home-only paths.

### Verification
- The focused public server suites pass 43/43 and the full suite passes 393/393 on local Node
  24.15.0. All 105 JavaScript files and four shell scripts pass syntax validation.
- The production dependency audit reports 0 vulnerabilities. Whitespace, release-content policy,
  fixed-code failures, owner or Administrator authorization, caller-only reset, mention safety,
  prompt bounds, channel isolation, and cross-guild state boundaries pass targeted review. Exact
  Node 22 acceptance remains a mandatory deployment gate.
- No deployment, command registration, service restart, Discord write, or cloud mutation occurred
  in this checkpoint.

## [1.20.0] - 2026-08-23

### Added
- New public guilds receive one fixed, mention-safe setup guide in an existing writable channel.
  Hengs never creates a channel, retries delivery, or activates the guild automatically.
- `/setup style` lets the guild owner or an Administrator select Balanced, Concise, or Technical
  replies through fixed choices.

### Changed
- Public guild config schema 2 stores only the fixed reply-style enum. Schema 1 remains readable
  and migrates atomically on the next authorized activation or style change.
- Public AI prompts now append one static style instruction while retaining guild-separated
  history and the neutral Hengs identity.

### Security
- Onboarding runs only for pending public guilds, verifies View Channel and Send Messages on the
  selected existing channel, disables mentions, logs fixed codes, and never persists delivery data.
- Reply style rejects free-form input, cross-guild state, and unauthorized members. Legacy command,
  component, moderation, member, reaction, and voice paths remain home-only.

### Verification
- The focused public, setup, config-store, and release suites pass 43/43. The full suite passes
  380/380 on local Node 24.15.0, and all 100 JavaScript files pass syntax validation.
- The production dependency audit reports 0 vulnerabilities. Targeted security review confirms
  fixed-enum prompt selection, owner or Administrator authorization, mention-safe onboarding,
  atomic config writes, cross-guild isolation, and privacy-safe failure logs.
- `git diff --check` and the tracked release-content policy pass. Exact Node 22 acceptance remains
  a mandatory deployment gate. No deployment, command registration, restart, invite installation,
  or public guild activation occurred in this checkpoint.

## [1.19.1] - 2026-08-21

### Fixed
- AI provider initialization now permits secretless immutable release acceptance. Groq and
  OpenRouter clients are created only when their dedicated keys exist, while production still
  receives the same keys from its root-controlled environment.
- Cloud deployment and release metadata now target v1.19.1 after v1.19.0 was rejected safely
  during pre-activation Ubuntu acceptance.

### Verification
- A focused child-process test reproduces the Ubuntu failure with all AI keys removed and now
  proves that `src/agent.js` loads without reading a local `.env`.
- Exact Node 22.23.2 full tests pass 372/372, all 99 JavaScript files pass syntax checks,
  `git diff --check` passes, and the production dependency audit reports 0 vulnerabilities.
- The v1.19.0 deployment attempt never switched the production symlink. Rollback acceptance found
  v1.18.0 active, enabled, connected, fresh, single-process, with WhatsApp cloud still active and no
  failed release directory.
- Immutable v1.19.1 deployment passed Ubuntu acceptance and two fresh connected heartbeats more
  than 30 seconds apart. Discord is active/enabled as one process, persistent state is available,
  WhatsApp stayed active, and v1.18.0 remains available for rollback.
- Command registration ran exactly once: one global `/setup`, 12 home commands, and no home-scoped
  `/setup`. Public installation is allowed, OAuth code grant is not required, and a least-privilege
  invite URL was generated.
- No friend guild activation, config mutation, state restore, VM reboot, WhatsApp restart, local
  bot start, or Anti-Raid mode change occurred.

## [1.19.0] - 2026-08-21

### Added
- Public Self-Service Beta menyediakan `/setup start`, `/setup status`, dan `/setup disable` tanpa
  meminta pengguna mencari atau mengirim Server ID.
- Konfigurasi server disimpan atomik pada namespace terpisah dan invite generator meminta izin
  Discord minimum tanpa membaca token.
- Traffic guard membatasi satu jawaban AI aktif dan 30 permintaan per 10 menit untuk setiap server
  publik.

### Changed
- Hanya `/setup` yang direncanakan sebagai global command. Dua belas command lama tetap terikat
  pada server utama Henry.
- History dan cooldown AI memakai key gabungan server dan user. Server publik memakai prompt Hengs
  netral tanpa profil pribadi Henry.
- Kapasitas default adalah 25 server aktif dan dapat diatur secara ketat dari 1 sampai 100.

### Security
- Semua handler lama, komponen, member event, reaction role, voice restore, dan moderasi gagal
  tertutup di luar server utama.
- Setup membutuhkan owner server atau Administrator, konfigurasi menolak path symlink dan schema
  asing, serta respons setup selalu privat dan bebas mention.
- Konfigurasi server dihapus saat `/setup disable`; konfigurasi yang rusak dan kapasitas penuh gagal
  tertutup tanpa membuka fitur privat.

### Verification
- Public Beta focused tests pass 28/28 and the complete suite passes 371/371 on exact Node
  22.23.2. All 99 JavaScript files pass syntax checks, `git diff --check` passes, and the
  production dependency audit reports 0 vulnerabilities.
- Targeted security review removed friend server names and IDs from startup logs, removed the
  unused setup channel ID from persistent config, disables mentions in AI replies, uses fixed public
  error logging, and found no credential material in changed files.
- Belum ada deployment, restart, registrasi command produksi, pembuatan invite nyata, atau
  perubahan server Discord pada checkpoint lokal ini.

## [1.17.2] - 2026-08-13

### Fixed
- Mutating `LaunchInstance` calls now pass OCI CLI `--no-retry`, preventing one acquisition
  invocation from being resubmitted implicitly by the CLI.
- Unmapped structured provider failures now become fixed non-retryable
  `PROVIDER_UNAVAILABLE` or `PROVIDER_ERROR` results instead of another ambiguous `UNKNOWN`.

### Security
- Provider codes, messages, stdout, stderr, identifiers, and request metadata remain absent
  from operator output and persisted acquisition state.
- Only trusted structured `OutOfHostCapacity` remains retryable. New provider buckets stop
  acquisition and require review; legacy `UNKNOWN` entries remain readable.

### Verification
- TDD regression started with four expected failures, then the focused OCI suite passed
  27/27 and the full suite passed 334/334.
- All 87 JavaScript files passed syntax checks; `git diff --check` passed and the production
  dependency audit found 0 vulnerabilities.
- Read-only Oracle Audit evidence showed that the previous second authorized CLI invocation
  produced three `LaunchInstance.begin` events under the old default retry behavior. A fresh
  instance list still found zero `hengs-discord` instances.
- No third acquisition attempt, VM creation, command registration, runtime restart, secret
  transfer, deployment, or cutover was performed in this checkpoint.

## [1.17.1] - 2026-08-13

### Fixed
- Diagnostik OCI sekarang membedakan `TIMEOUT`, `CLI_ERROR_UNSTRUCTURED`, dan
  `CLI_OUTPUT_INVALID`; error CLI tidak terstruktur dan output JSON rusak tidak lagi
  digabung menjadi `UNKNOWN`.

### Security
- Raw stdout, stderr, dan pesan error OCI tidak masuk ke hasil operator atau state acquisition;
  hanya kode tetap yang disimpan.
- Kode legacy `UNKNOWN` tetap diterima agar state attempt historis dapat dibaca tanpa reset
  atau migrasi yang berisiko.

### Verification
- Full `npm test`: 333 passed, 0 failed; focused OCI diagnostics: 26 passed, 0 failed.
- Seluruh 86 file JavaScript lulus syntax check; production dependency audit menemukan
  0 vulnerability; `git diff --check` lulus.
- Tidak ada command registration, runtime restart, public message, report-state mutation,
  attempt OCI kedua, pembuatan VM, token transfer, atau deployment dalam patch ini.

## [1.17.0] - 2026-08-13

### Added
- Owner-only **Lihat Contoh** pada antrean `/reports` yang kosong. Preview memakai data
  sintetis tetap dan renderer embed produksi tanpa kontrol tindakan moderator.

### Changed
- Empty state menjelaskan bahwa server sedang tenang, tempat laporan baru muncul, dan aksi
  **Cek Lagi**. Antrean aktif merangkum jumlah menunggu/ditangani serta langkah berikutnya.
- Label metadata antrean menggunakan bahasa yang lebih natural tanpa menambah detail privat.
- Metadata package, release builder, test fixture, README, dan cloud runbook disinkronkan ke
  v1.17.0. Schema slash command tetap sama sehingga registrasi ulang tidak diperlukan.

### Security
- `reports:preview` dicocokkan secara persis dan memeriksa ulang `OWNER_ID` saat tombol
  dikirim. Forged moderator preview gagal secara privat.
- Preview hanya memperbarui respons ephemeral yang sudah ada, menonaktifkan mention parsing,
  tidak membaca/menulis report store, tidak masuk audit/statistik, dan tidak mengirim panel
  publik atau mod-log.

### Verification
- Full `npm test`: 330 passed, 0 failed; focused Report Center: 14 passed, 0 failed; seluruh
  empat file JavaScript yang berubah lulus syntax check.
- Production dependency audit found 0 vulnerabilities.
- `git diff --check` lulus dan Impeccable interface detector melaporkan nol temuan.
- Targeted code/security review tidak menemukan Critical atau Important issue. Dua temuan
  minor ditutup dengan timestamp sintetis tetap dan test yang memaksa preview bebas store-read.
- Tidak ada command registration, runtime restart, public message, state mutation, atau cloud
  deployment dalam checkpoint ini.

## [1.16.0] - 2026-08-13

### Added
- Owner-only `/mod preview` renders a clearly labeled ephemeral incident example without
  persistence, statistics, mod-log delivery, detection, deletion, or ban side effects.
- Active enforcement now requires a second revision-bound Owner confirmation.

### Changed
- `/mod status` leads with the effective consequence and explains fail-safe fallback from
  requested Active to Monitor.
- Empty incident queues follow the effective mode, hide pagination noise, and expose only
  a `Cek Lagi` refresh action.
- Incident cards, mode controls, allowlist choices, mutation feedback, and recovery copy
  use concise Indonesian language while preserving mention-safe metadata boundaries.
- Monitor cards now say enforcement was not attempted instead of presenting false failure
  outcomes. Long valid allowlists are split across Discord-safe field sizes.
- Confirmed Active changes recheck the effective mode before reporting success; unsafe
  prerequisites are reported as a saved Active request that remains effectively Monitor.
- Configured Off remains effectively Off even when enforcement prerequisites are unavailable.

### Security
- Preview authorization is checked in both command and hub layers. Forged, malformed,
  stale, and unauthorized confirmation or cancellation controls fail closed.
- Mode-store failures acknowledge component interactions with sanitized recovery guidance
  instead of exposing errors or leaving Discord interactions unanswered.
- No moderation store schema changes were introduced; synthetic preview data cannot enter
  real incident or audit paths.

### Verification
- Full `npm test`: 326 passed, 0 failed; focused Moderation Center suite: 108 passed,
  0 failed; all 87 JavaScript files passed syntax checks.
- Production dependency audit found 0 vulnerabilities. The official credential scanner
  accepted all 14 changed tracked files, and `git diff --check` passed.
- Impeccable interface detector reported no findings. Targeted code and security re-review
  reported no remaining Critical or Important findings.
- Discord registered 12 guild commands; remote `/mod` includes `status`, `incidents`,
  `preview`, and `allow`. The runtime restarted as one connected v1.16.0 process with an
  advancing heartbeat and Anti-Raid still at Monitor revision 0.
- Read-only server verification passed with 0 failures and 0 warnings. No deployment, public
  message, allowlist mutation, or live Active-mode testing was performed.

## [1.15.1] - 2026-08-12

### Fixed
- OCI acquisition config now accepts either a regular compartment OCID or the root
  tenancy OCID, matching Oracle's valid compartment target behavior.
- Release metadata and archive naming are aligned to `1.15.1`.

### Security
- OCI CLI can use a dedicated trusted CA bundle for antivirus/proxy interception;
  TLS verification remains enabled and no bypass is introduced.

### Verification
- Real read-only OCI preflight passed against the configured home region, subnet,
  Ubuntu ARM image, availability domain, and A1 Flex shape.
- Acquisition remains `NOT_STARTED` with zero attempts; no VM or provider resource
  was created.

## [1.15.0] - 2026-08-12

### Added
- Bounded Oracle Always Free acquisition policy with privacy-safe atomic state, strict lock ownership, read-only preflight, and structured capacity-only retry.
- Reproducible release builder from committed `HEAD`, persistent-state snapshot/restore, encrypted export, hardened systemd unit, immutable deploy, health inspection, and rollback scripts.
- Public operator runbook in `docs/CLOUD-DEPLOY.md`.

### Changed
- Runtime target is pinned to Node.js 22 and release metadata is aligned at `1.15.0`.
- Instance-lock path and WhatsApp recovery-alert consumer can be configured for Linux while local Windows defaults remain unchanged.

### Security
- Releases reject secret/private paths, credential signatures, OCI identifiers, unsafe archive entries, symlinks, checksum mismatch, and dirty tracked trees.
- Cloud secrets remain outside release archives at `/etc/hengs/discord.env`; state is isolated under `/var/lib/hengs-discord/data` and off-VM backups require `age` encryption.
- Cutover requires one Discord token consumer. Anti-Raid remains in `monitor` mode and slash-command registration is unchanged.

### Verification
- Full `npm test`: 308 passed, 0 failed; focused cloud suite and all JavaScript syntax checks pass.
- All four Linux scripts pass `bash -n` through Git Bash. ShellCheck and `systemd-analyze verify` remain Ubuntu-host validation gates.
- Security review identified four High findings; all were closed with regression tests: restore ownership/modes, pre-cutover service enablement, dependency access to production state, and credential scan coverage.
- No VM, provider resource, deployment, Discord restart, command registration, or production cutover was performed in this checkpoint.


## [1.14.0] - 2026-08-11

### Added
- Private owner-first recovery alerts for Hengs WhatsApp lifecycle events.
- Exact private bot-settings fallback when owner DM delivery fails.
- Atomic local queue consumer with schema validation, stale-claim recovery, bounded retry, handled-ID deduplication, and rejected-event quarantine.

### Changed
- Discord lifecycle now starts the WhatsApp recovery consumer after ClientReady and stops it before graceful or fatal client destruction.

### Security
- Alerts are fixed mention-safe messages and accept only the four allowlisted lifecycle codes.
- Fallback fails closed unless the configured channel exactly matches `BOT_SETTINGS_CHANNEL_ID` and `DISCORD_GUILD_ID`.
- QR images, chat content, contact identifiers, tokens, paths, and raw errors are excluded.

### Verification
- Recovery state and consumer tests: 16 passed, 0 failed.
- Full Discord suite: 245 passed, 0 failed; all 66 JavaScript source/test files passed syntax checks.
- No Discord restart, command registration, live message, or live event injection was performed.


## [1.13.0] - 2026-08-11

### Added
- Deterministic Anti-Raid untuk blocked domain, repeated cross-channel content,
  single-channel link/attachment burst, dan cross-channel attachment flood tanpa AI.
- `/mod status`, `/mod incidents [page]`, dan owner-only `/mod allow` dengan respons
  ephemeral mention-safe.
- Kontrak operator publik di `docs/ANTI-RAID.md`.

### Changed
- `/mod incidents` sekarang memuat hingga 10 item per halaman dengan Previous, Refresh,
  Next, runtime authorization ulang, dan stale-page clamping.
- State menggunakan `schemaVersion: 1`; state legacy `schema: 1` divalidasi dan dimigrasi.
- Private incident card menampilkan hasil ban dan penghapusan secara eksplisit.

### Fixed
- Pesan raid yang sudah match tetap dihentikan sebelum AI saat persistence, capacity,
  enforcement, finalization, atau card delivery gagal.
- Capacity hanya mengevakuasi insiden final yang panel privatnya sudah persisten;
  evidence recovery tanpa panel dipertahankan atau creation gagal dengan fixed code.
- URL dengan credential atau port non-default tetap terdeteksi sebagai link dan dapat
  memicu blocked-host/burst, tanpa memakai domain allowlist sebagai trust bypass.
- Startup memulihkan insiden `detected` maupun `enforcing`; maintenance panel terus retry
  secara idempotent tanpa duplicate ban atau duplicate card.
- Referensi pesan fallback memiliki TTL 120 detik yang independen dari traffic dan
  dibersihkan setelah insiden selesai.
- Match pada window menit bersebelahan untuk member yang sama memakai satu incident,
  sehingga handler paralel tidak menghasilkan ban atau card ganda.

### Security
- State, audit, kartu, queue, dan log normal tidak menyimpan atau menampilkan content,
  URL/domain, attachment metadata, raw exception, atau mention aktif.
- System message, bot, webhook, DM, owner, administrator, reviewer, serta allowlist
  tervalidasi tetap exempt. Prasyarat permission/hierarchy gagal menjadi monitor-only.

### Verification
- `package.json` dan lockfile: `1.13.0`.
- Moderation tests: 95 lulus, 0 gagal.
- Full `npm test`: 229 lulus, 0 gagal.
- Syntax check seluruh JavaScript: lulus.
- `npm audit --omit=dev`: 0 vulnerability.
- `git diff --check`: lulus; warning LF/CRLF hanya normalisasi line ending.

### Live Acceptance
- Lulus 11 Agustus 2026: 12 guild command terdaftar dan `/mod` tersedia dengan
  `status`, `incidents`, serta `allow`.
- Runtime v1.13.0 online sebagai tepat satu instance. Owner smoke test membuka status
  `monitor/monitor`, prasyarat `Siap`, kontrol owner, dan antrean insiden.
- Smoke test tidak mengirim pesan publik, tidak menjalankan ban, dan tidak mengubah
  allowlist. Active auto-ban tetap tidak diuji tanpa akun dummy disposable.

### Next
- Jalankan mode `monitor` selama 1-2 hari dan tinjau `/mod incidents` untuk false positive.
- Aktifkan enforcement produksi hanya setelah hasil monitor dinilai aman.
- Checkpoint: `Hengs Discord v1.13.0: Add deterministic Anti-Raid`.

## [1.12.0] - 2026-08-09

### Added
- `/reports` sebagai antrean laporan aktif privat untuk owner dan role
  `REPORT_MODERATOR_ROLE_IDS`, dengan maksimum 10 item per halaman serta kontrol
  Refresh, Sebelumnya, dan Berikutnya.
- Priority persisten Normal, Penting, dan Mendesak pada setiap laporan, lengkap dengan
  sumber default category atau override moderator.

### Changed
- Laporan open/claimed diurutkan paling lama terlebih dahulu. Priority menjadi
  tie-break deterministik bila waktu pembuatan sama.
- Category harassment, spam/scam, dan inappropriate dimulai sebagai Penting; category
  lain dimulai sebagai Normal. Reviewer dapat mengubah priority dari panel privat.
- Panel laporan sekarang menampilkan priority aktif dan revision-safe controls.

### Security
- Queue hanya menampilkan Report ID, status, priority, category, usia relatif,
  claimant, dan tautan panel tervalidasi. Detail, pelapor, target, link pesan, bukti,
  final note, dan audit tidak dimasukkan.
- Runtime owner/moderator authorization diperiksa pada command dan setiap tombol queue.
  Respons selalu ephemeral, page dibatasi, dan mention parsing dimatikan.
- Kegagalan `/reports` dicatat sebagai fixed error code tanpa raw exception yang dapat
  membawa data laporan.

### Fixed
- Migrasi state legacy menambahkan kedua field priority secara atomik tanpa menaikkan
  revision; state parsial atau priority invalid tetap gagal tertutup.
- Perubahan priority memakai revision compare-and-set dan mempertahankan sync-pending
  bila edit panel Discord gagal, sehingga recovery startup tetap dapat memperbaikinya.
- Routing `report:` dan `reports:` dipisahkan agar forged component tidak berpindah
  ke handler yang salah.

### Tests
- 134 test lulus, termasuk legacy migration, category default, two-moderator race,
  forged component, queue privacy, pagination/clamping, permission recheck, panel-link
  validation, sync recovery, command wiring, dan safe logger placement.
- Semua 49 file JavaScript lulus syntax check, `git diff --check` lulus, dan
  `npm audit --omit=dev` melaporkan 0 vulnerability.
- Verifikasi Discord read-only dari main state lulus dengan 0 failure dan 0 warning.

### Operations
- Sebelas guild slash command, termasuk `/reports`, berhasil didaftarkan dan schema
  remote `/reports` terverifikasi tanpa opsi tambahan.
- Hengs Discord restart sebagai tepat satu instance v1.12.0 dan runtime health mencapai
  status connected dengan heartbeat aktif.
- Live owner acceptance lulus untuk empty queue, pembuatan laporan teknis non-sensitif,
  panel privat, default priority Normal, override ke Penting, queue metadata-only,
  Claim, serta penghapusan panel dan state uji.
- Outsider denial, pagination lebih dari 10 item, stale-button rejection, dan validasi
  target panel tetap diverifikasi oleh automated tests; acceptance live tidak membuat
  akun atau laporan dummy tambahan hanya untuk mengulang cakupan tersebut.

### Next
- Anti-Raid tetap fase terpisah v1.13.0. Checkpoint ini tidak menghapus pesan, memberi
  timeout, kick, ban, atau mengambil tindakan moderasi otomatis.

## [1.11.0] - 2026-08-09

### Added
- `/report` sebagai intake laporan insiden privat untuk seluruh member dengan kategori,
  detail, member terkait, link pesan satu server, bukti opsional, dan mode anonim.
- Panel moderator privat dengan Claim, Release Claim, Resolve, Dismiss, serta kontrol
  owner-only Reopen, Reveal Reporter, dan Purge.
- State laporan atomik, idempotensi interaction ID, batas tiga laporan aktif per
  pelapor, cooldown 60 detik, audit minim konten, dan retention default 30 hari.
- Pipeline bukti terverifikasi untuk PNG/JPEG/WEBP/GIF, MP4/WEBM, PDF, dan TXT dengan
  batas efektif maksimum 8 MiB, timeout, signature check, nama file aman, dan cleanup.

### Security
- Panel hanya dapat dibuat di `MOD_LOG_CHANNEL_ID` yang menutup View Channel untuk
  `@everyone`; tidak ada fallback publik atau berbasis nama.
- Intake juga gagal tertutup bila `OWNER_ID` belum diatur, role `@everyone` tidak pernah
  dianggap reviewer, dan bukti tidak boleh mengikuti redirect keluar Discord CDN.
- `REPORT_MODERATOR_ROLE_IDS` terpisah dari role Ops Hub. Semua tombol/modal mengecek
  ulang izin runtime; Reveal dan Purge tetap owner-only.
- Panel anonim tidak memuat ID pelapor, seluruh payload menonaktifkan mention parsing,
  dan audit tidak menyimpan isi laporan, link pesan, bukti, atau catatan moderator.
- Link pesan tidak hanya diperiksa bentuknya: Hengs mengambil pesan tersebut dari guild
  yang sama tanpa menyimpan isi pesan. Error internal dan path lokal tidak diteruskan
  kepada pelapor.
- Tidak ada hukuman otomatis, AI judgment, DM, notifikasi publik, atau integrasi Canox/WA.

### Fixed
- Claim memakai revision compare-and-set sehingga dua moderator tidak dapat sama-sama
  memiliki laporan yang sama.
- Restart menyinkronkan panel tertinggal; purge hanya menghapus state setelah pesan
  Discord berhasil dihapus atau sudah tidak ada, sedangkan kegagalan tetap retryable.
- Panel yang sempat terkirim sebelum proses crash tetapi belum masuk state ditemukan
  kembali lewat marker Report ID, sehingga retry/startup tidak mengirim panel ganda.
- Delivery claim atomik memastikan dua request paralel tidak dapat sama-sama mengirim
  panel. Respons kirim yang ambigu dipulihkan dengan pencarian marker sebelum retry.
- Kegagalan upload panel melepaskan reservation idempotent dan startup membuang
  reservation terputus yang tidak memiliki panel, sehingga tidak ada laporan aktif yatim.
- Resolve, Dismiss, dan Purge mengakui modal sebelum operasi state/jaringan; request
  paralel dari pelapor yang sama juga ditahan selama submission pertama berlangsung.
- Purge memakai revision compare-and-set sehingga modal lama tidak dapat menghapus
  laporan yang berubah ketika interaction sedang diakui.
- Cleanup file sementara diisolasi agar kegagalannya tidak membatalkan panel yang sudah
  tersimpan. State yang parseable tetapi tidak memenuhi schema lengkap kini gagal tertutup.

### Tests
- 112 test lulus, termasuk privacy channel, anonimitas, forged interaction,
  claim race, stale modal, evidence bounds/signature/cleanup, dan retention recovery.
### Operations
- Sepuluh guild slash command berhasil didaftarkan; schema remote `/report` terverifikasi
  memuat `category`, `details`, `member`, `message_link`, `evidence`, dan `anonymous`.
- `MOD_LOG_CHANNEL_ID` diarahkan ke channel `mod-logs` privat dengan reviewer owner-only,
  batas bukti 8 MiB, dan retention 30 hari.
- Live acceptance sintetis membuat panel anonim privat, memastikan identitas pelapor
  tersembunyi serta kontrol moderator tersedia, lalu menghapus kembali panel dan state uji.
- Bot restart sebagai satu instance `v1.11.0` dengan runtime health `connected`.
- Launcher lokal `restart.bat` dinormalkan ke ASCII/CRLF dan tidak lagi bergantung pada
  `timeout` interaktif, sehingga dapat dipakai dari shell hidden.

## [1.10.0] - 2026-08-09

### Added
- `/ops overview` sebagai Community Operations Dashboard privat untuk merangkum runtime,
  Ops Hub, Event Hub, antrean penerjemah, dan mode fokus.
- Snapshot read-only antrean penerjemah yang hanya mengembalikan configured, running,
  queued, depth, dan kapasitas.

### Security
- Akses dashboard memakai guard owner/editor Ops Hub yang sudah ada, respons ephemeral,
  dan mention parsing dinonaktifkan.
- Dashboard hanya memakai angka agregat dan enum allowlist. Isi draft/event, RSVP,
  identitas anggota, nama file, topik fokus, credential, path, dan raw error dibuang.
- Kegagalan satu store terisolasi sebagai kode `*_UNAVAILABLE`; dashboard tidak menulis
  atau memperbaiki state secara otomatis.

### Tests
- 59 test lulus, termasuk agregasi lintas-modul, privacy boundary, partial failure,
  permission command, respons ephemeral, dan snapshot antrean.
- Semua 36 file JavaScript lulus syntax check dan Git whitespace validation lulus.

### Operations
- Sembilan guild slash command berhasil didaftarkan ulang; schema remote `/ops`
  terverifikasi memuat `draft`, `status`, `overview`, dan `history`.
- Bot restart sebagai satu instance `v1.10.0`, mencapai `CONNECTED`, memperbarui
  heartbeat dan uptime setelah satu interval penuh, serta menolak instance kedua.
- Read-only Discord server verification lulus dengan 0 failure dan 0 warning.

## [1.9.0] - 2026-08-09

### Added
- Producer runtime health lokal di `data/runtime-health.json` dengan heartbeat 30 detik,
  versi, uptime, lifecycle koneksi Discord, dan kategori masalah terbatas.
- Kontrak consumer untuk status starting, connected, reconnecting, disconnected,
  degraded, invalidated, stopping, stopped, failed, serta deteksi stale 90 detik.

### Changed
- Login gagal, fatal process error, shutdown, shard disconnect/reconnect/resume, dan
  session invalidation sekarang memperbarui lifecycle snapshot sebelum proses berhenti
  atau launcher mencoba recovery.
- Single-instance lock sekarang menyegarkan timestamp setiap 30 detik dan memulihkan
  lock stale setelah lima menit. Ini menutup false-positive Windows `EPERM` pada PID
  yang sebenarnya sudah tidak ada tanpa melemahkan guard instance aktif.

### Security
- Snapshot ditulis lewat temporary file, flush, dan atomic rename; kegagalan I/O tidak
  menjatuhkan bot dan akan dicoba lagi pada heartbeat berikutnya.
- Token, API key, guild/channel/user ID, nama server, pesan, dokumen, draft, path, raw
  exception, dan stack trace tidak pernah masuk snapshot.

### Tests
- 55 test lulus, termasuk atomic write, stale/future timestamp, fail-closed schema,
  allowlisted issue code, I/O isolation, lifecycle disconnect/reconnect/recovery, lock
  stale, owner aktif, dan larangan proses lain melepas lock.
- Semua 34 file JavaScript lulus syntax check dan Git whitespace validation lulus.

## [1.8.0] - 2026-07-31

### Added
- Event Draft Editor privat dengan dua modal: **Edit Detail** untuk judul, deskripsi, waktu WIB, dan lokasi; **Kapasitas & Sumber** untuk kapasitas serta URL referensi.
- Nomor revisi persisten pada setiap draft dan panel untuk mencegah modal lama menimpa perubahan editor lain.
- Audit `event_edited` yang hanya menyimpan actor, revision, dan nama field tanpa menyalin isi event.

### Changed
- Owner dan role `OPS_EDITOR_ROLE_IDS` dapat merevisi draft Event Hub dari `bot-settings`; schema `/event` tidak berubah dan tidak memerlukan registrasi ulang.
- Panel draft menampilkan revisi aktif dan disinkronkan ulang setelah edit atomik.

### Security
- Hak edit diverifikasi ulang saat tombol dibuka dan modal disubmit. Publish, Discard, dan Cancel tetap owner-only.
- Edit ditolak setelah event meninggalkan status draft; URL, kapasitas, panjang teks, dan waktu masa depan divalidasi ulang di store.
- Compare-and-set revision menutup lost-update race dari dua modal yang dibuka bersamaan.

### Tests
- 46 test lulus, termasuk modal palsu tanpa izin, editor role, final-action guard, validasi kedua modal, stale revision, panel sync, dan larangan edit setelah publish claim.
- Semua file JavaScript lulus syntax check dan `git diff --check` lulus.

## [1.7.0] - 2026-07-31

### Added
- Inbox atomik `data/canox-event-inbox.json` untuk mengubah event hasil percakapan/riset Canox menjadi panel Event Hub privat.
- Referensi HTTP(S) opsional pada draft dan pesan event agar sumber hasil riset tetap dapat diperiksa sebelum dan setelah Publish.
- Startup recovery untuk file event Canox berstatus `processing` yang tertinggal akibat crash.

### Changed
- Event Hub menerima sumber Discord dan Canox melalui store/approval flow yang sama; schema slash command tidak berubah.

### Security
- Payload Canox diproses all-or-nothing, maksimal 10 event, dengan ID ketat, waktu masa depan berzona, panjang field terbatas, kapasitas 2-500, dan URL tanpa credential.
- Canox hanya dapat mengisi data draft. Status, actor final, publication, RSVP, reminder, dan channel tujuan tidak dapat dikendalikan melalui inbox.
- Publish, Discard, dan Cancel tetap diverifikasi terhadap `OWNER_ID`; seluruh output tetap menonaktifkan mention parsing.

### Tests
- 44 test lulus, termasuk contract inbox Canox, all-or-nothing validation, duplicate retry, private-only panel, source URL, timezone, dan stale processing recovery.
- Live acceptance lulus: sender produksi Canox membuat tepat satu panel privat, owner melakukan Discard, publication tetap null, tombol hilang, dan tidak ada file inbox/processing tersisa.

## [1.6.0] - 2026-07-31

### Added
- `/event draft` untuk membuat draft event privat dengan judul, deskripsi, waktu WIB, lokasi opsional, dan kapasitas opsional.
- `/event status` untuk melihat draft, event aktif, jumlah RSVP, event selesai, dan event dibatalkan.
- Panel approval Event Hub di `bot-settings`; editor dapat membuat draft sedangkan Publish Event, Discard, dan Batalkan Event tetap owner-only.
- Pesan event publik dengan RSVP eksklusif **Hadir**, **Mungkin**, dan **Batal RSVP**, termasuk penegakan kapasitas secara atomik.
- Reminder tanpa mention pada jendela 24 jam dan 1 jam, auto-close saat event dimulai, state persisten, serta pemulihan publish/reminder setelah restart.

### Fixed
- Race publish ganda, RSVP bersamaan, kapasitas penuh, cancel saat reminder sedang dikirim, dan stale message setelah crash ditutup oleh state claim sinkron serta `messageSyncPending` persisten.
- Crash setelah Discord menerima event tetapi sebelum state lokal final tidak mengirim event kedua; startup mencocokkan marker Event ID yang sudah terkirim.
- Draft yang jadwalnya sudah lewat tidak lagi dapat dipublikasikan; validasi dilakukan sebelum respons Discord dan di publish claim untuk menutup race waktu.

### Security
- Isi event tidak dapat memicu user, role, `@here`, atau `@everyone` mention karena seluruh publication/reminder memakai `allowedMentions: { parse: [] }`.
- RSVP publik hanya menyimpan Discord user ID secara lokal dan hanya menampilkan jumlah peserta; daftar identitas tidak dipublikasikan.
- Semua tindakan final diverifikasi ulang terhadap `OWNER_ID` saat tombol ditekan.

### Tests
- 41 test lulus, termasuk schema command, owner/editor guard, publish idempoten, penolakan draft kedaluwarsa, RSVP/capacity, cancel, reminder, auto-close, crash recovery, dan sinkronisasi panel/pesan publik.
- Live acceptance Discord lulus: satu RSVP Hadir tercatat, reminder satu jam terkirim tepat sekali, publikasi hanya satu, Cancel owner tersimpan, dan seluruh tombol panel/publik dinonaktifkan.

## [1.5.1] - 2026-07-31

### Added
- `npm run verify:server` untuk pemeriksaan Discord API read-only terhadap konfigurasi channel, permission, role hierarchy, owner, dan pesan reaction-role.
- Test render offline untuk welcome/leave card serta test auto-role dan hierarchy guard.

### Fixed
- Auto-role Member dan pembaruan statistik sekarang tetap berjalan jika `WELCOME_CHANNEL_ID` kosong, salah, atau welcome card gagal dikirim.
- Fallback role Member hanya menerima nama ternormalisasi yang persis `Member`, bukan role lain yang sekadar mengandung kata "member".
- Verifier memakai Windows system CA agar tetap mempertahankan validasi TLS saat koneksi lokal diintersepsi AVG.

### Operations
- Live server verification lulus tanpa failure/warning: owner, lima channel operasional, permission Manage Roles/Channels, hierarchy Member, dan tiga pesan reaction-role tervalidasi.
- `MEMBER_ROLE_ID` dan `ROLES_CHANNEL_ID` dikunci di `.env` lokal; autostart `HengsDC.lnk` dan restart satu-instance berhasil diverifikasi.
- 32 test lulus, welcome/leave PNG berhasil dirender, dan `npm audit --omit=dev` melaporkan 0 vulnerability.

## [1.5.0] - 2026-07-31

### Added
- Allowlist `OPS_EDITOR_ROLE_IDS` untuk moderator yang boleh membuat, melihat, mengedit, dan meminta revisi AI pada draft Ops Hub.
- `/ops history [limit]` untuk menampilkan 5–20 tindakan audit terbaru secara ephemeral.
- Audit persisten maksimal 500 tindakan yang menyimpan jenis tindakan, ID draft, pelaku, waktu, dan metadata operasional terbatas.

### Changed
- Gate tampilan `/ops` menggunakan permission Discord **Manage Messages**, lalu tetap diperketat oleh allowlist role/owner pada runtime.
- `/ops` dapat dijalankan dari channel operasional karena command memiliki runtime guard sendiri.

### Security
- Publish Now, Jadwalkan, Batalkan Jadwal, dan Discard tetap owner-only meskipun editor dapat melihat tombolnya.
- Role editor diverifikasi ulang pada setiap slash command, klik tombol, dan submit modal; role yang dicabut langsung kehilangan akses.
- Audit tidak menyalin judul, brief, atau isi draft dan output history menonaktifkan mention parsing.
- `OWNER_ID` tetap wajib; konfigurasi editor tidak dapat membuka Ops Hub bila owner belum dikonfigurasi.

### Tests
- 29 test lulus, termasuk editor allowlist, penolakan tindakan final, modal guard, schema `/ops history`, migrasi state lama, dan pemeriksaan bahwa isi draft tidak masuk audit.
- Live acceptance Discord lulus: draft privat dibuat, diedit, lalu di-Discard; `/ops history` menampilkan ketiga tindakan tanpa isi draft dan tanpa publication.

## [1.4.0] - 2026-07-31

### Added
- Tombol owner-only **Jadwalkan** pada draft pending dengan input waktu WIB `HH:mm` atau `YYYY-MM-DD HH:mm`.
- Tampilan khusus draft terjadwal dengan waktu publikasi, jumlah percobaan, serta tombol **Publish Now**, **Batalkan Jadwal**, dan **Discard**.
- Worker jadwal persisten yang memeriksa draft jatuh tempo setiap 15 detik dan tetap melanjutkan jadwal setelah restart.

### Changed
- `/ops status` sekarang menampilkan jumlah draft terjadwal.
- Tombol Publish diberi label **Publish Now** untuk membedakan publikasi segera dari publikasi terjadwal.

### Fixed
- Klaim atomik `scheduled -> publishing` mencegah worker, klik Publish Now, atau dua tick scheduler mengirim draft yang sama dua kali.
- Kegagalan pengiriman terjadwal dicoba ulang setelah 1 menit dan 5 menit; setelah tiga kegagalan draft kembali ke pending untuk direview.
- Publish Now yang gagal pada draft terjadwal mengembalikan draft ke jadwal semula, bukan menghilangkan jadwal.
- Draft terjadwal yang dibatalkan atau dibuang menyimpan metadata jadwal terakhir untuk audit lokal.
- Pesan publik yang berhasil terkirim sebelum proses mati tetap dapat direkonsiliasi melalui marker Draft ID yang sudah ada.

### Security
- Jadwalkan, batalkan, Publish Now, dan Discard tetap memakai pemeriksaan runtime `OWNER_ID`.
- Publikasi otomatis tetap menonaktifkan seluruh mention sehingga isi draft tidak dapat memicu `@everyone`, role mention, atau user mention.

### Tests
- 25 test lulus, termasuk parser WIB, rollover besok, validasi tanggal, lifecycle jadwal, retry bertingkat, pembatalan, Publish Now, dan pengujian worker paralel tanpa duplicate publish.
- Live acceptance Discord lulus: draft privat berhasil dijadwalkan, panel berubah ke status terjadwal, jadwal dibatalkan kembali ke review, lalu draft di-Discard tanpa publication.

## [1.3.0] - 2026-07-31

### Added
- Tombol owner-only **Edit**, **Perpendek**, dan **Regenerate** pada setiap panel Ops Hub pending.
- Modal edit untuk mengubah judul dan isi tanpa membuat draft atau publication baru.
- Riwayat maksimal 20 versi sebelumnya per draft sebagai audit trail lokal.

### Changed
- `/ops status` sekarang menampilkan jumlah draft yang sedang direvisi.
- Panel pending lama disinkronkan saat startup sehingga memperoleh kontrol revisi terbaru.

### Fixed
- State transition `pending -> revising -> pending` mencegah Publish, Discard, atau revisi kedua berjalan bersamaan dengan panggilan AI.
- Revisi AI yang gagal mengembalikan draft asli beserta tombolnya dan tidak lagi dilaporkan sebagai sukses melalui fallback teks lama.
- Revisi yang terputus karena crash dipulihkan ke pending; startup juga memperbaiki panel bila proses mati setelah state tersimpan tetapi sebelum Discord selesai diperbarui.
- Submit modal lama tidak dapat menimpa draft yang sudah publishing, published, discarded, atau sedang direvisi.

### Security
- Semua tombol dan modal revisi tetap memakai runtime `OWNER_ID`; permission tampilan Discord tidak dijadikan satu-satunya guard.
- Prompt revisi memperlakukan brief dan isi draft sebagai data, mempertahankan fakta, serta melarang mention dan detail rekaan.

### Tests
- 20 test lulus, termasuk revision lock, stale modal, owner guard, revision history, AI failure rollback, crash recovery, dan startup panel refresh.
- Live acceptance Discord lulus: Regenerate dan Perpendek berhasil melalui Groq GPT-OSS 120B, dua versi tercatat, lalu draft uji di-Discard tanpa publication.

## [1.2.0] - 2026-07-31

### Added
- `/translate file:<attachment> to:<language> non_sensitive:true` untuk PDF, DOCX, PPTX, HTML, dan TXT dengan auto-detect bahasa sumber.
- Autocomplete bahasa tujuan dari DeepL, allowlist owner/VIP, antrean serial, progress ephemeral, timeout, serta pengecekan kuota sebelum upload.
- Client DeepL berbasis endpoint resmi dengan native `fetch` Node 24 untuk usage, languages, upload, polling, dan download dokumen.

### Security
- Konfirmasi non-sensitif wajib untuk DeepL API Free; dokumen personal/rahasia ditolak secara kebijakan dan peringatan selalu tampil.
- Validasi ekstensi, MIME, ukuran DeepL/Discord, Discord CDN HTTPS, signature PDF/OOXML, dan deteksi binary masquerading sebagai TXT/HTML.
- Nama file disanitasi; isi, filename, URL attachment, key, dan document handle tidak masuk log.
- Input/output memakai direktori temp unik dan selalu dihapus di `finally` setelah attachment hasil di-upload.
- `deepl-node` tidak dipakai di runtime karena dependency `adm-zip` memiliki advisory high; native client menghapus jalur rentan tersebut.

### Changed
- Dependency non-breaking diperbarui dan `npm audit --omit=dev` sekarang melaporkan 0 vulnerability.

### Tests
- 14 test lulus untuk Ops Hub, allowlist/schema command, format/MIME/size/CDN validation, bounded download, file signature, filename sanitization, bahasa tujuan, antrean serial, dan native DeepL client.
- Integrasi TXT end-to-end dengan client produksi berhasil (upload, polling, download, 29 billed characters, cleanup temp).
- Live acceptance Discord berhasil: `/translate` mengembalikan attachment TXT bahasa Indonesia secara ephemeral, melaporkan 141 billed characters, dan tidak meninggalkan direktori temp.

### Research
- DeepL Document Translation divalidasi langsung dengan key API aktif: TXT EN -> ID berhasil, penggunaan terukur, dan cleanup file sementara terverifikasi.
- Dicatat batas format/ukuran, minimum billing 50.000 karakter untuk DOCX/PPTX/PDF, serta batas privasi API Free sebelum implementasi `/translate`.

## [1.1.1] - 2026-07-31

### Fixed
- Publish/Discard sekarang memakai transisi state sinkron `pending → publishing → published`, sehingga klik ganda atau dua interaction bersamaan tidak dapat mengirim pengumuman duplikat.
- Draft yang sudah terkirim tetapi proses mati sebelum finalisasi dipulihkan saat startup melalui marker Draft ID di embed announcements.
- State JSON yang rusak sekarang gagal tertutup dan tidak lagi dianggap sebagai state kosong yang dapat menimpa riwayat draft.
- Pemrosesan inbox Canox memakai mutex, nama processing unik, external ID wajib, dan cleanup file sukses untuk mencegah overlap serta duplikasi.
- File inbox Canox berstatus `processing` yang tertinggal akibat crash dipulihkan saat startup sehingga draft tidak hilang senyap.
- Single-instance lock mencegah dua proses Hengs Discord memakai token dan Ops state yang sama secara bersamaan.
- Panel yang gagal disimpan dihapus kembali agar tidak meninggalkan tombol yatim.
- Judul/body divalidasi terhadap batas embed Discord; draft kosong ditolak.
- Tombol draft lama dengan ID 12 karakter tetap kompatibel; draft baru memakai ID 16 karakter.

### Security
- Runtime owner check tetap wajib pada slash command dan tombol; `/ops` tidak tersedia melalui DM.
- Ruang review tidak lagi fallback ke `BOT_CHANNEL_ID`; hanya ID eksplisit atau nama persis `🎛️・bot-settings`/`bot-settings` yang diterima.
- Announcement tetap memakai `allowedMentions: { parse: [] }` sehingga draft AI/Canox tidak dapat memicu mass mention.

### Tests
- Ditambahkan test Node bawaan untuk idempotensi external ID, single publish claim, transisi publish/discard, validasi dan crash recovery inbox Canox, pemilihan review channel, serta corrupt-state fail-closed.

## [1.1.0] - 2026-07-30

### Added
- Ops Hub: `/ops draft`, `/ops status`, panel approval owner, penyimpanan draft lokal, dan inbox file Canox.

### Note
- Commit `5b7e604` berjudul "Add private document translation", tetapi diff commit tersebut sebenarnya berisi Ops Hub dan migrasi model AI. Implementasi document translation belum ada di tree checkpoint ini.

## [0.6.0] - 2026-06-28
### Fixed
- **Reaction roles MATI total → IDUP**: `partials` nggak di-set di Client → event reaksi di pesan lama nggak nyampe. Ditambah `partials` + fetch partial message. (`src/index.js`)
- **`/announce` bisa gagal senyap**: tambah `deferReply` (cegah timeout 3 dtk) + try/catch di `channel.send`. (`src/commands/announce.js`)
- `role-store.save()` dibungkus try/catch (cegah corrupt JSON reaction-roles senyap). (`src/utils/role-store.js`)
- Error yang ketelen dikasih logging: getroles cleanup, webhook setup, `/fun quote`. (`admin.js`, `fun.js`)
- AI chat: user-turn baru di-commit ke history HANYA kalau model sukses (cegah turn yatim) + 401 OpenRouter langsung stop (nggak buang 70 dtk). (`src/agent.js`)
### Security
- **`/announce` `@everyone`** dikunci Administrator (dulu holder "Manage Messages" bisa mass-mention). (`src/commands/announce.js`)
- **AI chat**: rate-limit per-user (anti spam nguras kuota) + history key pakai **user-ID** (bukan username) + cap memori (anti leak) + aturan anti prompt-injection. (`src/agent.js`)
- **`/admin restart`** ditambah guard `OWNER_ID` server-side (`defaultMemberPermissions` cuma petunjuk UI). Set `OWNER_ID` di `.env`. (`src/commands/admin.js`)
- `npm audit fix` + discord.js udah v14 terbaru (14.26.4) → sisa 4 vuln (undici, transitif) DIBIARKAN: nggak langsung exploitable, nutupnya butuh upgrade ke v15 yang breaking.
- Polish robustness: log URL avatar pas timeout, try/catch `/admin rules`+`serverinfo` send, voice auto-rejoin cleanup pas channel kehapus. (`welcome-card.js`, `admin.js`, `index.js`, `voice.js`)

## [0.5.0] - 2026-06-24
### Added
- Titik awal pencatatan changelog. Bot sudah jalan (AI chat via mention, `/study` `/scrim`, `/announce`, `/fun`, `/admin setup/ids/rolereact/webhook/lockdown`, welcome/leave card, stats channels). Setup server & test welcome/roles masih pending — lihat `CLAUDE.md`.
