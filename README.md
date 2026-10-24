# 🤖 Hengs Discord Bot — Henzzz

> Bot komunitas serba-bisa untuk server Discord: AI chat, mode fokus, welcome card custom, reaction roles, dan auto-setup struktur server.

**Current checkpoint:** Hengs Discord v1.81.0 - the Analis caster: an LLM writes caster-style lines for the match-day
cards and answers Analis questions in #tanya-hengs, only from Hengs' own Liquipedia numbers (every number, hero and
team it names is checked; otherwise the template or the guide). Builds on v1.80.1: welcome and leave cards now have a
compact hero pill, stronger member
focus, and a clearer Hengs logo watermark. Preview: `assets/_originals/welcome-card-v2-preview.png`. Builds on
v1.80.0 Hengs Analis match days: at 08:00 WIB a broadcast-style preview card
per match (season record, go-to heroes) with buttons to guess the winner, a night recap card (results, hero numbers,
how many guessed right) and an event recap card after the grand final; the watchlist adds MPL ID S18, the Esports
Nations Cup 2026 and M8. Builds on v1.79.3 (welcome and leave cards use the new Hengs bot logo with a safe legacy
fallback), v1.79.2 (failed sends reported in bot-settings with the missing permissions named, once per 6 hours per
failure), v1.79.1: Hengs
chat no longer opens an unsure answer with "maaf" (code drops
the apology; the honest game facts prompt stays). Builds on v1.79.0 Hengs Coach v2: one team practice target with
`/scrim target` and a
debrief nudge after the third game of a day, pro draft stats and a Liquipedia hero dictionary in the coach's data
card, and unsure answers that start from the data instead of "gatau". Builds on v1.78.0 `/admin setup` v2 (a guided
community setup: packages, News + Memes, a theme picked from an image board or written as a custom pattern, a
sidebar preview image, optional rename of old channels; the old menu and the legacy full setup are gone), v1.77.0 (own `🤖・tanya-hengs` channel,
`bot-commands` stays shared with other bots), v1.76.0 chat mode phase 2 (send
memes and news, log or undo a scrim by chat, each through a requester-only "Lanjut" button into the slash flow),
v1.75.0 chat mode phase 1
(Hengs chats in `tanya-hengs`, coaches in `hasil-scrim`, waves 👋 elsewhere), v1.74.0
Coach LLM, v1.73.0 Gen Z coach voice and `/scrim hapus`, v1.72.3 honest game facts rule, and v1.72.0-v1.72.2 Hengs
Analis with reaction buttons under every meme. Committed and pushed, not deployed: the deploy waits for Henry's
GPT assets and his approval. Cloud-live is v1.71.0 (one-tap meme votes) since 2026-10-23 15:09 WIB (includes v1.70.0 memes that learn from members' reactions, v1.69.0 livelier memes and Hengs Coach phase 1, v1.67.0 read-only news
and meme channels with `/kirim`, v1.66.1 WordPress feeds, v1.66.0 five memes a day, v1.65.0 trending news,
v1.64.2 private hasil-scrim, v1.63.0 Casterin)

Hengs-made memes have 28 templates with irony and twist formats (rotating by day), five options per call and a
judge that needs humour 8, and they learn from members' reactions, offering the best-liked templates and
situations first. Hengs adds 😂 😐 💀 as real reactions under every meme (Hengs-made, Lemmy and xkcd) so a vote
is one tap; on Hengs memes 😐 counts against in the taste store. Hengs Coach phase 1 is a scrim notebook for Hengs Family: `/scrim hasil` logs one MLBB
game (one dropdown for the result and loss reason, lineup prefilled), `/scrim rekap` gives a private team recap
and `/scrim statku` sends a player's own numbers by DM. Every number shows its sample size.

Chat mode (home server, phase 1): mention Hengs in its own `🤖・tanya-hengs` or in `bot-settings` to chat.
`/admin setup` with the Hengs package creates the channel in the Hengs category (an existing `BOT CENTER` counts),
with members on the server's own permissions and a pinned guide. `bot-commands` stays shared with other bots: Hengs' slash commands work there, but
once `tanya-hengs` exists a mention there only gets 👋. Until then Hengs still chats in `bot-commands`. Keyword rules go first; otherwise a small Groq model (gpt-oss-20b, JSON, only the
message text) picks an intent. Feature intents (news, memes, analis, scrim, kirim, lapor, caster, event, help) get
a fixed guide with channel links and the slash command, never posted feature content, and team data stays in
`hasil-scrim`. In `hasil-scrim` only the coach answers. Anywhere else a mention gets one 👋 and nothing more.
`@everyone`, `@here` and role pings no longer wake Hengs. Each member gets 40 LLM chats per WIB day; the owner is
exempt. No DM chat.

Chat actions (phase 2):
- In `tanya-hengs`, "kirim" with an attached image (meme) or an HTTPS link (news) gets a "Lanjut" button.
- In `hasil-scrim`, "catat scrim lawan X menang/kalah karena ..." or "hapus scrim terakhir" gets one too, before
  the coach. A missing opponent or result gets a question instead of a guess.
- Only the requester can press the button. It lasts 10 minutes, works once and only in that channel. Anyone else
  gets a private "bukan buat kamu".
- The click runs the existing `/kirim` or `/scrim hasil` / `/scrim hapus` flow with the chat values. Its checks,
  image review, private preview and final confirm are unchanged.

Hengs Analis posts one card per finished MLBB pro series (MPL PH and MPL ID playoffs for now) in the read-only
`📊・hengs-analis` channel, made by `/admin setup` with the Hengs package, which also posts and pins a guide. Data comes
from the Liquipedia API (query only, gzip, one request per 2 seconds at most, a User-Agent with the public repo
URL, checks every 20 minutes while a series is live and every 3 hours otherwise). Hengs draws the card itself:
score, per game winner, side, length, objective, picks and bans, MVP and up to two notes counted from the
games; no logos, hero art or screenshots, and no AI-written facts. Cards follow Liquipedia corrections for 72
hours; a member's ⚠️ sends the server owner one DM. Henry's backgrounds go in `assets/esports/`
(`series-bg.png` square, at least 1600x1600, scaled to cover cards 900 to about 1600 px tall; `guide-banner.png`
1600x500); without them the card uses the Aurora gradient.

News and meme channels are read-only for members, who send memes and links with `/kirim meme` and
`/kirim berita` in bot-commands (private preview, own confirmation, images checked by the vision model).
Hengs-made memes come from everyday situations only and must pass a second Groq judge before they are
posted. No admin queue or AI fact-check certification. Availability counters remain removed.
Cloud deployment was accepted on 2026-10-18 and separate routing has been live since 2026-10-19.
On 2026-10-21 both channels became read-only for members, who now send with `/kirim`.
Both channels sit in Announcements, outside Bot Center. Private sharing preview/cancel passed;
no test item was published. Native permissions were audited, not tested with another member account.

Cloud-live since 2026-10-17: News sends one item at a time, at least one hour apart (for example
08:00, 09:00, 10:00 WIB). `/hengs help` separates member features from privileged controls.
Appreciation rosters use bullets; editors may select up to eight Discord members to notify on
owner-approved publication, or keep no tags. Preview never notifies; edits clear selections.
Existing Hall of Fame roster and pinned request instructions have already been updated live.

Appreciation drafts now use the reviewed Crown Stage artwork, with an adaptive logo/trophy,
literal tournament and result text, and up to eight players with optional nicknames. Edit
opens a prefilled form and refuses stale revisions. Review remains private before owner
publication. The poster plus an unchanged organizer certificate were
verified in the bot test channel. Reusable certificate ingestion remains deferred; this upload
used a supervised one-off operator, not a new bot command.
The home server now has a Hall of Fame under Community, with the first owner-approved
poster and original certificate published. Members can react and discuss in public threads;
main-channel posting is limited to Hengs and administrators. Reusable Ops destination selection
has not changed: this publication was supervised, not automatic routing of future drafts.

Selective Canox memory is available only to the configured owner through ephemeral `/hengs ask`
in the home guild. `ingat: ...` opens a preview, `oke simpan ingatan` confirms it, and
`daftar ingatan`, `ubah ingatan ID: ...`, `lupakan ID`, or confirmed `hapus ingatan ID` manage
only explicitly approved memory entries. Other administrators, guilds and public mentions cannot
retrieve them. Ordinary local notes and the Canox project bridge keep their existing behavior.
Canox must be reachable and configured with a dedicated capability after an approved schema
migration. Memory is default off; reset clears RAM, not saved notes, revisions or backups.

**Current cloud production:** v1.66.0 accepted on 2026-10-21 05:07 WIB after one controlled restart:
Node22 candidate QA 740 passed, zero failed, three checkout-only skips (743 total), two fresh heartbeats,
WhatsApp v0.50.0 and Canox untouched, news state unchanged on disk (it becomes schema 4 at the first slot).
The live schedule reads as news 08:00 and 10:00 (tech + AI) and one meme at 13:00 until a manager sets 5 + 5.
v1.64.2 remains available for rollback. Before it, v1.64.2 was accepted on 2026-10-21 02:48 WIB (hasil-scrim
stays private after the restart) and v1.64.1 on 2026-10-20 21:05 WIB,
private Canox memory connected. Node22 candidate QA: 717 passed, zero failed, three checkout-only skips
(720 total); command shapes unchanged, so no re-registration. v1.64.0 (accepted earlier the same day): Two fresh advancing heartbeats passed; WhatsApp and Canox were not restarted; news state unchanged.
Home guild commands re-registered (13, including `/caster` and `/scrim hasil`). Casterin stays inactive
("belum aktif") until a Gemini key is installed. v1.64.1 remains available for rollback. On 2026-10-20
Scrim tim was provisioned at Henry's request: the permissionless `Hengs Family` role and
`📸・hasil-scrim` under Gaming, created by the bot's own setup code without a restart. Teammates still
get the role manually. The public bot invite is also included in Hengs' application description.

**Development status:** local feature work continues in bounded checkpoints. Cloud is the single
Discord token consumer; local Discord remains stopped as rollback only.

## Setup komunitas (`/admin setup` v2)

Sejak v1.78.0, pemilik server atau Administrator di server utama menjalankan `/admin setup`, lalu:

1. **Paket**, boleh lebih dari satu: Lobby (welcome, rules, ambil-role), Komunitas (ngobrol, media), Gaming
   (mabar, info-scrim), Hengs (tanya-hengs, hengs-analis), Tim scrim (hasil-scrim privat), Creator (live-stream,
   showcase), Voice (Lounge, AFK).
2. **News + Memes**: tambah `hengs-news` dan/atau `hengs-memes` ke kategori Hengs. Jadwal berita tidak ikut nyala.
3. **Tema** dari gambar contoh: Emoji + titik (`🤖・tanya-hengs`), Garis tegak (`🤖︱tanya-hengs`), Panah pohon
   (`╰┈➤tanya-hengs🤖`), Kurung neon (`ˌ🤖ˈtanya-hengs`), Polos, atau **Tema custom** dengan pola `{emoji}` dan
   `{nama}`.
4. **Preview** berupa gambar sidebar: BARU = dibuat, GANTI = ganti nama. Tombol **Samakan nama lama** (mati secara
   bawaan) menamai ulang channel dan kategori lama yang berikon ke tema yang sama; ID, izin dan isinya tetap.
5. **Bikin sekarang**. Hengs mengecek dulu server belum berubah sejak preview, lalu membuat kategori, channel dan
   izin, mem-pin panduan tanya-hengs dan hengs-analis, dan melaporkan yang gagal tanpa mencoba ulang.

Channel yang slug-nya sudah ada (nama tanpa hiasan depan dan belakang) dipakai lagi, tidak dobel. Tanpa ganti
nama, setup tidak mengganti nama, memindah atau menghapus apa pun. Izin: welcome, rules dan ambil-role cuma dibaca
anggota; hengs-analis, hengs-news dan hengs-memes cuma Hengs yang posting (yang sudah ada ikut dirapikan);
hasil-scrim privat untuk role Hengs Family; ngobrol, media dan voice ikut pengaturan server. Setup lengkap versi
lama (channel statistik, webhook GSA, template Henzzz) sudah dihapus. Gambar preview memakai Twemoji (CC-BY 4.0)
dan DejaVu Sans, lihat `assets/setup/README.md`.

## Catatan scrim (Hengs Coach fase 1)

Admin/owner: `/admin setup` -> paket **Tim scrim** -> tema -> preview -> **Bikin sekarang**. Hengs membuat role
`Hengs Family` (tanpa izin server tambahan) dan channel privat `hasil-scrim` di kategori Hengs, atau memakai yang
sudah ada dan merapikan izinnya jadi privat. Cuma Hengs Family dan Hengs yang bisa melihat dan kirim. Anggota tim
ditambahkan ke role secara manual lewat Server Settings > Members.

Anggota Hengs Family di bot-commands, satu perintah per game (target di bawah 30 detik):
`/scrim hasil lawan hasil [ss] [catatan]`. `lawan` punya autocomplete dari lawan yang pernah dicatat; `hasil`
satu dropdown: W, atau L plus alasan utama (early game, objective, teamfight, draft, lainnya). Preview
privat menampilkan kartu, skor hari ini vs lawan yang sama dan pilihan lineup (maks 5, otomatis terisi lineup
game terakhir yang masih Hengs Family), lalu Kirim/Batal (hangus 10 menit). Hengs memposting kartu (plus SS kalau
ada) tanpa ping dan mencatat game itu. Kalau hasil-scrim ternyata bisa dilihat semua member, Hengs menolak memposting.

`/scrim rekap [lawan]`: rekap tim privat (semua game, 7 dan 30 hari, form 5 game terakhir, alasan kalah, 5 lawan
teratas, 3 catatan terakhir); dengan `lawan` jadi ingatan sebelum ketemu lawan yang sama. `/scrim statku`:
statistik game yang mencantumkan kamu di lineup, dikirim lewat DM saja. Semua angka ditulis "W X dari N game";
persen baru muncul mulai 5 game dan "paling sering" mulai 5 kekalahan. Suara coach: Gen Z santai buat anak-anak
(W/L, slang secukupnya, tanpa kata kasar, tanpa nyalahin pemain atau ngeledek lawan).

Salah catat: `/scrim hapus` menampilkan game terakhir yang kamu catat secara privat; "Hapus game ini" menghapusnya dari
rekap dan menarik kartunya di hasil-scrim. Admin yang menghapus satu kartu Hengs di hasil-scrim juga ikut menghapus
game-nya; purge massal tidak menyentuh data.

Ngobrol sama coach: anggota Hengs Family yang mention Hengs (atau reply balasannya) di hasil-scrim ngobrol sama
coach. Sebelum AI dipanggil, program menyiapkan kartu data dari buku catatan (rekap tim, rekap lawan yang disebut,
waktu WIB); AI tidak pernah melihat ID Discord atau data mentah. Aturannya dari riset coaching: satu fokus per jawaban
(target, posisi sekarang, satu langkah konkret), target proses yang dicatat di `/scrim hasil` berikutnya, pertanyaan
refleksi, bahas keputusan main bukan orangnya, tanpa stat pemain lain. `/scrim tanya pertanyaan` menjawab privat,
sekali tanya sekali jawab, ditambah stat penanya sendiri. Riwayat coach terpisah dari chat biasa (maks 12 pesan).
Program mengecek tiap jawaban sebelum disimpan atau dikirim: kata kasar atau label nyalahin pemain disensor (`n***`),
dan kalau AI menulis penanda bantuan atau pertanyaannya menyebut tanda bahaya (dibully, bunuh diri), teks tetap berisi
SAPA 129 dan Healing119 ikut dikirim. Coach cuma jawab di hasil-scrim asli (atau thread di dalamnya). Batas 15
pertanyaan yang dijawab AI per orang per hari.

Target dan debrief: `/scrim target isi: ...` memasang satu target latihan tim (kebiasaan main yang bisa dicek sendiri),
diumumkan di hasil-scrim tanpa ping; `/scrim target` tanpa isi menampilkannya. Coach ikut membaca target itu. Setelah
game ketiga yang dicatat di hari yang sama (bukan jam 22.00 sampai 05.00 WIB), Hengs mengirim satu ajakan debrief: satu
hal yang jalan, satu keputusan yang mau dibenerin, dan target berikutnya. Data: `data/scrim-coach.json`.

Pengetahuan coach dari Liquipedia (CC-BY-SA, dikredit di bawah jawaban): pertanyaan soal meta, pick, ban, atau draft
menambah statistik draft pro dari halaman MPL yang sudah dibaca Hengs Analis (selalu dengan jumlah game), dan pertanyaan
yang menyebut hero menambah role, lane, dan spesialis hero itu dari `src/scrim/mlbb-heroes.json` (dibangun ulang dengan
`node scripts/build-mlbb-heroes.js` kalau ada hero baru).

Data: `data/scrim-games.json`, satu baris per game (ID pesan, waktu, ID pencatat, lawan, menang/kalah, alasan,
lineup berupa ID Discord, catatan), maksimal 500 game terbaru per server. Gambar tetap di Discord. File lama
`data/scrim-results.json` (per seri, v1.64) tidak dibaca lagi.

## Casterin

`/caster` (server utama; member biasa di bot-commands): tulis momen maksimal 150 karakter, pilih persona,
lalu Hengs membalas teriakan caster AI berupa file suara. Persona fiksi: Bang Jago Esport, Bapak-bapak
Bola, Wibu Ngegas, Caster Galau. Preview privat dulu (Kirim, Ulang, Batal; hangus 10 menit). Postingan
publik diberi label "Suara AI, persona fiksi" dan nama pemesan tanpa ping.

Naskah ditulis Groq `openai/gpt-oss-120b`, suara dari Gemini TTS `gemini-3.8-flash-tts` dengan cadangan
`gemini-3.8-flash-lite-tts`. Free tier Gemini dibatasi 10 request per hari per model, jadi
`CASTER_DAILY_LIMIT` default 20, ditambah 3 per member per hari, reset 07:00 WIB. Tidak ada file yang
disimpan, tidak ada kloning suara, dan teks momen tidak dicatat di log. Butuh `GEMINI_API_KEY` dari
project Google khusus Hengs; tanpa key, `/caster` menjawab "Casterin belum aktif."

## Hengs News

### Pisahkan news dan memes, kontribusi anggota

Dari v1.62.0 sampai v1.77.0, `/admin setup` di server utama memiliki pilihan **News + memes**; sejak v1.78.0
pilihan itu jadi langkah 2 wizard (lihat Setup komunitas).
Preview menjelaskan pembuatan/pemakaian dua channel dan pembukaan izin kirim/file/link bagi anggota.
Konfirmasi hanya menyentuh kedua channel itu, bukan setup server lengkap. Nama/kategori channel
lama dan overwrite role/anggota lain tetap; channel meme baru mengikuti kategori news.
Pembuatan channel tidak mengubah tujuan atau mengaktifkan jadwal bot.

Mulai v1.65.0, pengelola memilih tujuan dengan `/hengs ask`:
`atur berita teknologi AI gaming 5 berita jam 08:00 ke #hengs-news` lalu
`atur berita meme 5 jam 13:00 ke #hengs-memes`, kemudian `preview berita` dan `terapkan berita`
untuk channel utama yang sudah teruji. Konfigurasi baru tetap perlu uji dan aktivasi. Berita dan
meme punya jumlah (berita 1-5, meme 0-5), jam, dan channel sendiri; channel keduanya harus berbeda.
Satu item per kiriman, tiap dua jam. Berita dipilih dari yang lagi panas: poin per jam di Hacker
News, jumlah media berbeda yang memuat cerita yang sama dalam 12 jam, dan Google Trends Indonesia.
Kartu media Indonesia tanpa foto penerbit. Tanpa tujuan meme, slot meme dilewati, bukan dikirim ke
news.

Mulai v1.66.0, meme 5 per hari: 3 buatan Hengs (template meme yang lagi sering dipakai menurut Imgflip,
teks AI bahasa Indonesia soal topik yang lagi rame atau tema sehari-hari mahasiswa/gamer, dirender
memegen.link) dan 2 dari luar (komik xkcd baru, atau post Lemmy programmer_humor yang lolos cek
gambar oleh model vision Groq). `preview meme` menampilkan satu contoh privat. Opsional
`GROQ_VISION_MODEL` di env (default `qwen/qwen3.8-27b`).

Anggota dapat mengirim sendiri di news/memes jika izin Discord mengizinkan, tanpa antrean admin.
Untuk lewat Hengs, gunakan `/hengs ask` di bot-commands (atau channel yang diizinkan server publik):

- `bagikan berita: https://contoh.com/artikel` untuk satu link HTTPS. Hengs tidak membuka link.
- `bagikan joke: teks leluconmu` untuk teks tanpa link atau mention.
- `bagikan meme: https://discord.com/channels/.../.../...` untuk link pesan milikmu di channel
  perintah yang sama, dengan satu gambar PNG/JPG/WebP/GIF maksimal 8 MB. Hengs meneruskan link,
  bukan mengunggah ulang gambar. Untuk gambar langsung tampil, unggah sendiri ke channel meme.

Preview privat berlaku 10 menit; pengirim menekan **Kirim kirimanku** atau **Batal**. Izin
source/tujuan, timeout, kepemilikan pesan, dan pengaturan dicek lagi saat konfirmasi. Hasil diberi
nama pengirim tanpa ping dan label kiriman komunitas, bukan verifikasi fakta/keamanan. Tidak ada
URL fetch, pemeriksaan AI atau penyimpanan isi ke file. Tidak otomatis meneruskan posting biasa.
Relay dibatasi satu per menit per anggota dan server. Jika tujuan memakai slowmode, anggota
diminta posting langsung agar tidak melewati batas Discord. Hasil kirim yang tidak pasti tidak
dicoba ulang otomatis; cek tujuan dahulu. Reset/restart membatalkan preview.

Schema news v3 menambah tujuan meme; upgrade mempertahankan pengaturan dan bukti kiriman lama.
Rollback ke runtime lama memerlukan downgrade tervalidasi saat service berhenti, bukan restore
receipt lama. Jadwal yang memuat hiburan dijeda pada downgrade agar tidak kembali tercampur.

v1.58.1 memperketat format editor pada Groq GPT-OSS 120B/20B dengan schema JSON,
penalaran rendah dan output penalaran disembunyikan. Provider/model lain tetap memakai kontrak
JSON sebelumnya. Batas tetap 700 token, 8 detik, tanpa retry atau rotasi model. Pemeriksaan
bahasa, panjang, angka dan konten tetap dilakukan setelah jawaban diterima.
Kegagalan kini dibedakan melalui kode tetap untuk akses, rate limit, timeout, request, provider,
jawaban terpotong/kosong, JSON dan schema, tanpa mencatat respons mentah atau secret.
Probe kandidat dengan dua cuplikan publik lolos validasi; ini bukan jaminan semua output akan
berhasil. Perbaikan editor ini sudah termasuk dalam deployment v1.61.0.

v1.58.0 memisahkan revisi isi dari pemasangan channel baru. Setelah channel berhasil diuji,
ubah topik/jam/jumlah/gaya, `preview berita`, lalu `terapkan berita`: jadwal aktif tetap aktif,
jadwal jeda tetap jeda, dan riwayat kiriman tidak direset. Tidak mengirim saat menerapkan revisi;
pengaturan baru dipakai pada jadwal berikutnya yang masih punya slot. Pindah channel tetap perlu uji.
Gunakan `atur berita 2 berita 1 meme` untuk maksimal dua berita dari topik pilihan + satu komik.
Jika topik berita belum dipilih, teknologi + AI dipakai. Dalam campuran dengan dua item, bagiannya
menjadi satu berita + satu hiburan. Berita tampil dulu, komik terakhir dengan warna/label berbeda.
Slot yang kosong tidak diganti jenis lain; sejak v1.61.1 jumlah tersedia tidak lagi ditampilkan.
Cloudflare Blog ditambahkan sebagai sumber teknologi. Komik tanpa cuplikan tidak dikirim ke AI
untuk ditebak, dan tidak menggagalkan ringkasan berita lain. Versi ini sudah live; komposisi
dua berita + satu komik dimulai pukul 08:00 WIB. Sejak v1.61.0 setiap item mendapat slot
terpisah pukul 08:00, 09:00 dan 10:00 WIB, tanpa kiriman tambahan saat revisi diterapkan.

v1.57.0 menambahkan judul dan ringkasan pendek bahasa Indonesia dari cuplikan feed,
dengan gaya santai atau netral sesuai pengaturan. Hasil diberi label ringkasan AI, bukan
verifikasi fakta atau hasil membaca artikel penuh. Tautan sumber, gambar dan tanggal tetap asli.
Jika provider tidak tersedia, output ditolak atau anggaran terpakai, cuplikan bahasa sumber tetap
ditampilkan dengan keterangan bahwa ringkasan Indonesia belum tersedia. Tidak ada klaim bebas halusinasi.
Pilihan dibatasi maksimal satu artikel per penerbit, terbaru lebih dulu. Jumlah berita adalah
batas atas, bukan target wajib. Dalam v1.58.0, teknologi + AI memiliki tiga penerbit; pilihan
tetap dapat lebih sedikit jika bahan baru tidak tersedia. Tidak menambah topik otomatis.
Pada deployment v1.57.0 tanggal 2026-10-16, preview privat di bot-commands menampilkan gambar,
judul/ringkasan Indonesia dan sumber untuk satu artikel baru. Jadwal home guild kemudian diaktifkan
dengan persetujuan Henry: teknologi + AI, pukul 08:00 WIB, gaya santai, maksimal tiga item dan satu
artikel per penerbit. Aktivasi tidak mengirim ulang edisi hari itu. Pengujian tetap di bot-commands.

v1.56.0 menampilkan satu kartu per artikel: gambar dari feed penerbit di atas, lalu judul,
cuplikan singkat, tautan sumber dan tanggal WIB. Maksimal tiga kartu tetap berada dalam satu
pesan, bukan tiga kiriman terpisah. Preview privat dan kiriman memakai susunan yang sama.
Jika feed tidak punya gambar yang lolos pemeriksaan, kartu tetap berisi teks dan sumber.
Gambar memakai URL HTTPS pada domain/path penerbit yang sudah ditentukan, bukan hasil AI,
scraping halaman artikel, unggahan ulang, atau URL dari pengguna. Discord memuat preview gambar;
Hengs tidak mengunduh atau menyimpan byte gambar. Tampilan gambar bergantung pada penerbit,
Discord dan pengaturan tampilan media pengguna. Cuplikan fallback tetap mengikuti bahasa sumber.
Perubahan visual sudah dideploy dan preview privat nyata lulus pada 2026-10-16. Edisi teks yang
sudah terkirim tidak diubah/dikirim ulang. Jadwal home guild aktif sejak 2026-10-16; server lain
tetap harus mengatur, menguji dan mengaktifkan jadwal sendiri. Pakai `jeda berita` untuk menjeda.

Pada v1.55.0, `/admin setup` di server utama menanyakan **Mau tambahkan Hengs News sekarang?**
Pilih **Ya** untuk melihat preview, **Belum sekarang** untuk melewati penambahan, atau **Batal**.
Untuk server yang sudah tertata, tombol **Tambah news saja** membuat satu channel baca-saja tanpa
menjalankan template setup lama. Jika channel `hengs-news` sudah ada, namanya, kategori dan izinnya
dipertahankan. Channel ganda/jenis yang salah atau izin kurang akan menghentikan tindakan.
**Setup lengkap + news** tetap menjalankan seluruh template lama dan baru dilakukan setelah
konfirmasi preview. Melewati news tidak menghapus channel atau mematikan konfigurasi news lama.
Pembuatan channel tidak otomatis mengaktifkan jadwal, mengambil feed, atau mengirim berita.
Sejak v1.78.0 menu ini diganti wizard setup v2, dan setup lengkap lama dihapus.

Pemilik server atau Administrator bisa menyiapkan bacaan harian lewat `/hengs ask`.
Fitur tidak aktif otomatis saat update. Pilih channel teks yang sudah ada di server yang sama.

1. `atur berita teknologi AI jam 08:00 ke #hengs-news` membuat draft privat.
2. `preview berita` memperlihatkan isi tanpa mengirim ke channel.
3. Revisi: `kurangi AI, tambahin gaming`, `lebih santai`, atau `ubah jam 09:00, 2 berita`.
   Revisi membatalkan persetujuan preview lama. Waktu memakai format 24 jam WIB.
4. `simpan berita` menyimpan pengaturan dalam keadaan jeda. Ini opsional sebelum kiriman uji.
5. Setelah preview terbaru, `kirim berita sekali` menyimpan pengaturan dan menguji satu kiriman.
6. Setelah uji berhasil, `preview berita` lalu `aktifkan berita` menyalakan jadwal harian.
7. `jeda berita` untuk pause; `status berita` untuk pengaturan dan hasil pengiriman terakhir.
8. Untuk revisi di channel teruji: ubah draft, `preview berita`, lalu `terapkan berita`.
   Tidak perlu uji kirim lagi meskipun slot hari ini sudah terpakai. Preview tetap wajib.

Mulai v1.61.0, maksimal 3 item per hari dikirim terpisah, jeda minimal satu jam. Contoh:
08:00 berita, 09:00 berita, 10:00 hiburan. Satu kiriman uji hanya berisi satu item dan menutup
sisa slot hari itu. Slot kosong tidak diganti jenis lain. Sumber saat ini:
[Mozilla Hacks](https://hacks.mozilla.org/feed/) dan [Cloudflare Blog](https://blog.cloudflare.com/rss/) untuk teknologi,
[NVIDIA Blog](https://blogs.nvidia.com/feed/) untuk AI,
[Steam News](https://store.steampowered.com/feeds/news.xml) untuk gaming, dan
[xkcd](https://xkcd.com/atom.xml) untuk hiburan/komik, bukan berita faktual atau katalog meme umum.
Sumber boleh tidak punya berita baru setiap hari. Artikel berumur lebih dari 72 jam, tanpa tanggal,
dari masa depan, atau yang sudah dikirim tidak dipilih. v1.56.0 mengikuti bahasa sumber;
v1.57.0 dapat meringkasnya dengan AI. Tidak ada pengunduhan media oleh Hengs atau tag massal.
Topik dan URL sumber bebas belum didukung. Publisher feed bukan jaminan klaimnya selalu benar.

Editor v1.57.0 hanya mengirim judul dan cuplikan publik yang sudah dibatasi, bukan riwayat chat,
memori Canox, ID pengguna/server, gambar atau token. Memakai Groq yang sudah dikonfigurasi;
jika Groq tidak dikonfigurasi, memakai model OpenRouter free pertama yang sudah tersedia.
Satu request per batch, timeout 8 detik, tanpa retry/rotasi model. Batas global per proses:
satu request berjalan, jeda minimal 30 detik dan 12 percobaan per jam. Batas reset saat restart,
bukan jaminan biaya nol. Cache hasil dan kegagalan hanya RAM selama 10 menit, maksimal 60 batch.
Preview menyimpan salinan ringkasan yang sama sampai konfirmasi, tidak menghasilkan ulang saat kirim.

Preview berlaku 10 menit untuk pemanggil, server dan channel yang sama. Konfirmasi tidak dapat
dipakai ulang. `terapkan berita` mempertahankan status untuk channel yang sudah diuji; `simpan berita`
tetap menjeda/reset uji. Channel baru selalu perlu uji sebelum aktif. Revisi saat kiriman masih
berjalan ditolak sampai selesai; izin pengelola/tujuan dan revisi diperiksa kembali saat konfirmasi.
Bot memeriksa jadwal tiap menit, dengan jendela satu jam per slot pada hari WIB yang sama, bukan
mengejar slot yang terlewat. Slot yang melewati tengah malam dilewati. Jika hasil kiriman tidak
pasti, bot tidak mencoba ulang slot itu; slot berikutnya tetap menunggu jeda satu jam.
receipt persisten dan nonce Discord mengurangi risiko duplikat. Pause tidak menarik kiriman
yang sudah berangkat. Jadwal juga berhenti saat Hengs dinonaktifkan di server publik.

`data/news-state.json` menyimpan pengaturan per server, receipt serta hash URL,
bukan chat privat atau isi artikel. Receipt/hash dibersihkan pada perubahan state setelah 30 hari;
saat jadwal dijeda, metadata lama bisa bertahan sampai perubahan berikutnya. File ikut snapshot Discord terenkripsi yang sudah ada dan
divalidasi saat backup/restore. Restore dari backup lama dapat kehilangan receipt terbaru, jadi
pause dan review jadwal sebelum mengaktifkan ulang sesudah restore. Schema v2 mempertahankan
receipt lama sebagai klaim satu hari penuh. Sebelum rollback ke binary sebelum v1.61.0, hentikan
service dan konversi state memakai `downgradeState` di `src/news/store.js` dengan write atomik
tervalidasi. Adapter menggabungkan slot menjadi hari terpakai, bukan menghapus bukti pengiriman.
Tidak perlu mendaftarkan slash command baru.

**Public invite:** [Add Hengs to a Discord server](https://discord.com/oauth2/authorize?client_id=1512417103138000948&permissions=101376&scope=bot+applications.commands)

## ✨ Fitur Utama

- **AI chat via mention:** tinggal mention bot, dia bales kontekstual (history terpisah per server dan user)
- **Private Discord assistant:** `/hengs ask` di server utama menjawab ephemeral, jadi percakapan LLM
  tidak tampil di channel. Konteks privat dan mention publik memakai ruang memori terpisah, masing-masing
  dibatasi maksimal 64 pesan privat/48.000 karakter dan 24 pesan publik/24.000 karakter per user,
  dengan kedaluwarsa enam jam. Konteks terbaru dan topik lama yang relevan dipilih dalam batas
  request, bukan seluruh riwayat. `/hengs reset` menghapus kedua konteks dan permintaan personal
  yang masih menunggu, bukan catatan/pengingat yang sudah tersimpan.
- **Connected feature follow-up:** "ada lagi?" melanjutkan chat biasa jika tidak ada permintaan
  personal yang menunggu. "Jam 9 malam" dan "oke catat" tersambung ke pengingat/catatan yang tepat.
  Hasil fitur privat memberi status minimal ke konteks AI, tanpa isi catatan atau pengingat.
- **Assistant response experience:** `/hengs ask` menampilkan status proses yang privat atau sesuai scope,
  mention menjaga typing indicator selama fallback model, dan prompt Hengs lebih tegas soal identitas,
  klaim tindakan, serta pertanyaan lanjutan.
  Humor ringan boleh saat sesuai, tetapi topik serius tetap jelas dan empatik. Konteks sesi bukan
  pembelajaran permanen. Checkpoint ini tidak mengubah Canox atau menjalankan provider live.
- **Prompt-first community planning:** owner atau Administrator dapat menulis prompt natural untuk
  merancang struktur lobi, gaming, dan creator. Hengs memberi blueprint teks serta kartu visual
  privat sebelum ada perubahan. Prompt dapat memilih nama channel polos atau memakai ikon, memilih
  opsi 1 sampai 4, lalu merevisi nama kategori atau channel dengan pasangan "nama lama" jadi
  "nama baru". Copy sapaan dapat ditulis sebagai draft. Setelah owner meninjau dan menekan Apply,
  Hengs dapat memasang pesan itu satu kali di channel sambutan lobi dengan mention dinonaktifkan,
  lalu menyimpan copy yang sudah disetujui untuk welcome otomatis berikutnya.
  Owner atau Administrator dapat mengubah, melihat, atau mematikan copy tersimpan lewat `/hengs ask`
  secara privat tanpa mengubah channel yang sudah ada.
  Preview privat kini menawarkan tema Aurora neon, Midnight gelap, atau Minimal bersih tanpa
  mengubah struktur channel atau menambah state persisten baru. Kamu juga bisa memilih text
  lengkap, text inti, atau tanpa text, lalu membatasi jumlah voice room dari area yang dipilih.
- Welcome Card v2 menampilkan custom welcome copy langsung di kartu, badge `START HERE`, dan embed
  onboarding berurutan untuk rules, role, intro, serta pengumuman. Public onboarding juga memberi
  alur tiga langkah yang ringkas tanpa state baru.
  Welcome home memakai satu sapaan, satu panduan empat langkah, dan satu bantuan tanpa pengulangan
  template lama. Link mendukung nama channel Indonesia, misalnya `aturan-server`, `ambil-role`,
  `kenalan`, dan `pengumuman`; ID konfigurasi tetap didahulukan. Copy custom tidak ditimpa.
  Perbaikan v1.58.2 dan v1.59.0 masih lokal, tidak mengedit pesan welcome yang sudah terkirim.
  Nama tampilan member menjadi judul utama kartu; `@username` menjadi identitas pendamping.
- **Kartu apresiasi:** owner/editor server utama bisa menulis `bikin kartu apresiasi` kepada Hengs,
  lalu mengisi tombol formulir: pemain/tim, pencapaian, nama acara, tanggal, dan maksimal delapan
  pemain. Nickname opsional, misalnya `Raka (Sky)`, satu pemain per baris. Detail yang belum
  diketahui tidak dikarang. Draft PNG dan teks lengkap masuk ke `bot-settings`, bukan langsung
  dipublikasikan. Owner tetap memutuskan publish/jadwal, tanpa role, poin, atau leaderboard baru.
  Contoh cepat: `bikin apresiasi Tim Orion karena juara 1 turnamen kampus; tanggal 17 Oktober 2026`.
  Edit manual tetap tersedia; AI rewrite dimatikan agar fakta penghargaan tidak berubah.
  Jika format teks diubah bebas, gambar lama dihapus dan draft menjadi teks biasa.
  Logo Hengs Family dipakai untuk tim Hengs Familia/Family, penerima lain memakai ilustrasi trofi.
  Preview offline sintetis: `node scripts/preview-community-cards.js`; hasil di `.cloud/previews/`.
  Hengs membuat kategori lalu menempatkan channel text dan voice yang masih kurang di dalamnya.
  Channel lama tidak di-rename, dipindah, dihapus, atau diubah permission-nya.
- **Prompt Review privat:** tombol Tinjau sekarang membuka preview privat dengan TTL lima menit.
  Owner dapat melihat kartu visual, mengonfirmasi, lalu menerapkan channel text dan voice yang masih
  kurang dari blueprint tetap
- **Prompt fokus natural:** owner atau Administrator dapat menulis "fokus belajar", "mulai scrim",
  "status mode", atau "selesai fokus" tanpa slash command. Perintah ambigu tetap meminta klarifikasi
- **Prompt operasi natural:** owner atau editor Ops Hub dapat menulis pengumuman, tugas proyek, atau event
  dengan bahasa biasa. Hengs membuat draft privat di Ops Hub atau Event Hub, lalu review dan publish
  tetap mengikuti approval yang sudah ada
- **Canox project handoff:** kartu tugas dari Canox masuk melalui inbox file lokal yang sama dan
  tetap menunggu review privat di `bot-settings`.
- **Status operasi natural:** owner atau editor Ops Hub dapat menulis "lihat status draft" untuk
  melihat jumlah draft dan event secara privat tanpa membuka isi, mengubah state, atau memicu publish
- **Catatan dan pengingat pribadi:** owner atau Administrator dapat memakai `/hengs ask` dengan
  bahasa biasa. Hengs memberi preview catatan sebelum menyimpan, menanyakan jam jika pengingat belum
  lengkap, lalu mengirim pengingat satu kali melalui DM tanpa menulis ke channel publik
- **Public Server Essentials:** owner cukup menjalankan `/setup start` lalu memilih satu channel
  dari menu Discord. Hengs Standard mengaktifkan gaya Santai, bahasa Otomatis, cakupan channel
  tersebut, dan Community Pack dalam satu langkah tanpa Server ID atau Channel ID manual
- **Community Control Center:** `/setup dashboard` membuka panel privat untuk melihat status,
  kesehatan konfigurasi, tren penggunaan, memperbaiki channel, preview kartu, membuka Insights,
  atau menonaktifkan Hengs melalui konfirmasi kedua
- **Control Center Settings:** menu privat menyediakan preset gaya dan bahasa, pemilih channel chat,
  pemilih channel Community Pack, mode semua channel, serta tombol mematikan Community Pack tanpa
  command tambahan atau ID manual
- **Owner Insights:** owner atau Administrator dapat membuka ringkasan penggunaan privat lewat
  `/setup insights`. Laporan menampilkan hari aktif, rata-rata, hari tersibuk, cakupan feedback,
  tingkat membantu, tren tujuh hari, kesehatan konfigurasi, dan saran tetap tanpa menyimpan isi
  chat atau identitas member
- **Community Pack publik:** owner dapat memakai `/setup welcome` untuk preview privat, lalu
  mengaktifkan kartu masuk dan keluar di channel saat ini tanpa mencari Server ID atau Channel ID
- **Mode fokus** — `/study on/off/status`, `/scrim on/off`
- **Utility** — `/announce`, `/fun` (quote · 8ball · roll · flip · meme)
- **Ops Hub** — `/ops draft` menyusun pengumuman dengan AI; editor allowlist dapat membuat dan merevisi draft, sedangkan owner memegang Publish Now, jadwal, pembatalan, dan Discard
- **Community Event Hub** — `/event draft` membuat event ber-approval dengan RSVP, kapasitas, reminder, cancel, dan auto-close
- **Restricted document translation** — `/translate` menerjemahkan PDF, DOCX, PPTX, HTML, atau TXT non-sensitif melalui DeepL, khusus owner/VIP
- **Private WhatsApp recovery alerts** - owner DM first, exact private `BOT_SETTINGS_CHANNEL_ID` fallback, with deduplication and bounded retry
- **Always Free deployment support** - bounded OCI acquisition, privacy-safe fixed diagnostics, immutable Linux releases, persistent state, systemd hardening, health inspection, and rollback; operator guide: [`docs/CLOUD-DEPLOY.md`](docs/CLOUD-DEPLOY.md)
- **Runtime health contract** — heartbeat lokal atomik untuk status connected, reconnecting, stale, failed, dan recovery tanpa data privat
- **Community Operations Dashboard** — `/ops overview` merangkum health, draft, event, antrean terjemahan, dan mode fokus secara privat
- **Incident Report Hub** — semua member dapat memakai `/report`; laporan opsional anonim masuk ke panel moderator privat dengan Claim, Resolve, Dismiss, Reopen, dan Purge
- **Moderation Queue** - `/reports` memberi owner/moderator antrean privat metadata-only dan panduan tindakan yang jelas; owner dapat membuka contoh sintetis saat antrean kosong
- **Deterministic Anti-Raid** - `/mod` memantau atau menangani pola raid berkeyakinan tinggi tanpa klasifikasi AI; detail operator ada di [`docs/ANTI-RAID.md`](docs/ANTI-RAID.md)
- **Setup komunitas** - `/admin setup`: pilih paket dan tema, lihat preview gambar sidebar, baru channel dibuat; yang sudah ada dipakai lagi
- **Reaction roles** — `/admin rolereact` (persist ke `data/`)
- **Layered welcome / leave cards:** background aurora hasil ImageGen dipadukan dengan glass layer,
  avatar glow, member count, umur akun, tanggal join/keluar, dan durasi member berpresisi menit
  melalui `@napi-rs/canvas`
- **Auto-assign role** Member pas join + **stats channel** auto-update (jumlah member dll)
- **Admin tools** — `/admin ids`, `/admin webhook`, `/admin lockdown`

## 🛠️ Stack

| Komponen | Teknologi |
|---|---|
| Runtime | Node.js |
| Library | discord.js v14 |
| Grafis | @napi-rs/canvas (welcome card) |
| Voice | @discordjs/voice + tweetnacl |
| AI | Groq / OpenRouter (via openai SDK) |
| Dokumen | DeepL Document Translation API |

## 🚀 Setup

```bash
# 1. Install dependencies
npm install

# 2. Siapkan konfigurasi
cp .env.example .env
#    -> isi DISCORD_TOKEN, CLIENT_ID, GUILD_ID, channel IDs, API key

# 3. Daftarkan slash commands (sekali, atau tiap nambah command baru)
npm run deploy

# 4. Jalankan
npm start
```

Panduan lengkap dapetin token & channel ID ada di **`docs/SETUP.md`**.

### Auto-start tersembunyi (Windows, opsional)

```bash
install-autostart.bat   # pasang sekali -> bot nyala sendiri tiap login
start-hidden.vbs        # nyalain manual sekarang (tanpa window)
stop-bot.bat            # hentikan bot
```

### Cloud deployment (live)

Dukungan deployment Always Free untuk Ubuntu tersedia bagi A1 Flex dan E2 Micro. A1 memakai
sizing fleksibel, sedangkan E2 adalah fixed shape dan memiliki config/state terpisah agar histori
acquisition tidak bercampur. OCI CLI tidak melakukan retry internal `LaunchInstance`; error
provider dipetakan ke kode tetap tanpa menyimpan output mentah. Public Self-Service v1.28.0 menyediakan
dua command global `/setup` dan `/hengs` yang sudah didaftarkan ke Discord production. Satu E2 Micro Always Free berhasil
dibuat pada 14 Agustus 2026 dan berstatus `RUNNING`. Bootstrap Ubuntu sudah lulus dengan Node 22,
UFW, Tailscale, user layanan, dan unit systemd. Release immutable v1.60.0 kini menjadi
production `current`, lulus tes Node22 dan dua heartbeat sehat setelah restart terkontrol.
v1.58.0 tetap tersedia untuk rollback. News home guild aktif setiap 08:00 WIB setelah persetujuan,
maksimal dua berita teknologi/AI + satu komik. Revisi tanpa kiriman tambahan dan state sudah
diverifikasi, tetapi kiriman harian pertama belum teramati. Preview campuran terakhir memakai
fallback cuplikan sumber; kualitas ringkasan Indonesia masih perlu ditinjau.
Secret serta state persisten awalnya
dipindahkan lewat jalur privat Tailscale dengan verifikasi checksum, manifest, ownership, dan mode.
Service systemd sekarang active/enabled sebagai satu-satunya token consumer; bot Discord lokal
berhenti sebagai jalur rollback. Initial start, restart service, dan reboot VM masing-masing lulus
dua heartbeat `CONNECTED` yang segar. Deployment v1.28.0 mempertahankan konfigurasi Anti-Raid
yang sudah tersimpan tanpa melakukan perubahan mode. Community Pack tetap opt-in dan belum
diaktifkan pada server publik mana pun oleh deployment. Ikuti
[panduan cloud](docs/CLOUD-DEPLOY.md) dan jangan menyalakan consumer lokal sebelum cloud dibuktikan
berhenti.

Checkpoint v1.26.0 sampai v1.28.0 sudah digabung ke cloud. Registrasi command berjalan satu kali
setelah health service lulus, dan audit memastikan `/setup dashboard` tersedia bersama dua command
global serta 12 command home. Discord cloud tetap menjadi satu-satunya consumer; kedua bot lokal
berhenti dan Hengs WA cloud tetap aktif tanpa restart atau perubahan auth.

## 💬 Commands

| Command | Fungsi |
|---|---|
| `@Hengs <pesan>` | Ngobrol sama AI atau tulis prompt natural untuk rancangan komunitas |
| `/hengs ask` · `/hengs reset` · `/hengs help` · `/hengs privacy` · `/hengs invite` | Tanya Hengs, kelola ingatanmu, pahami privasi, buka panduan, atau undang Hengs ke server lain |
| `/setup start` · `/setup dashboard` · `/setup status` · `/setup style` · `/setup language` · `/setup channel` · `/setup welcome` · `/setup insights` · `/setup disable` | Jalankan setup terpandu, buka pusat kontrol privat, kelola Community Pack, dan lihat tren serta kesehatan konfigurasi |
| `/study on/off/status` · `/scrim on/off` | Mode fokus |
| `/announce` · `/fun ...` | Pengumuman & hiburan |
| `/ops draft` · `/ops status` · `/ops history` · `/ops overview` | Draft pengumuman, approval owner, audit, dan ringkasan operasi privat |
| `/event draft` · `/event status` | Event komunitas dengan approval owner, RSVP, kapasitas, reminder, dan auto-close |
| `/translate file to non_sensitive:true` | Terjemahkan dokumen non-sensitif; bahasa sumber dideteksi otomatis |
| `/report category details [member] [message_link] [evidence] [anonymous]` | Kirim laporan insiden privat kepada owner/moderator |
| `/reports` | Buka antrean laporan aktif privat untuk owner/moderator |
| `/mod status` · `/mod incidents` · `/mod preview` · `/mod allow ...` | Lihat status/insiden, buka pratinjau owner-only, atau kelola pengecualian Anti-Raid |
| `/admin setup` | Setup komunitas: paket, tema, preview gambar, lalu bikin |
| `/admin rolereact` | Pasang reaction roles |
| `/admin ids` | Scan channel ID buat .env |

## 📁 Struktur

```
discord-bot/
├── src/
│   ├── index.js            # entry point, event handler
│   ├── agent.js            # logika AI chat
│   ├── state.js            # state mode
│   ├── deploy-commands.js  # daftarin slash commands ke Discord
│   ├── commands/           # slash commands, termasuk ops & translate
│   ├── ops/                # draft store, owner approval, inbox Canox
│   ├── events/             # event approval, RSVP, reminder, recovery
│   ├── translation/        # DeepL client, validasi, antrean, cleanup
│   ├── runtime/            # health lokal dan konsumer recovery alert WhatsApp
│   ├── reports/            # intake privat, state machine, bukti, panel, recovery
│   ├── moderation/         # policy deterministic Anti-Raid, tracker, enforcement, state privat
│   └── utils/
│       ├── welcome-card.js # render welcome/leave card (canvas)
│       └── role-store.js   # persistensi reaction roles
├── docs/                   # SETUP.md, dll
├── test/                   # test race/idempotensi Ops Hub
├── .env.example            # template konfigurasi
└── package.json
```

## ⚠️ Catatan

### Ops Hub: Canox → Discord dengan approval owner

Canox tidak boleh mem-posting ke channel publik secara langsung. Untuk menyusun pengumuman, ia dapat menulis draft ke `data/canox-ops-inbox.json`:

```json
{
  "drafts": [
    {
      "id": "event-unik-001",
      "title": "Turnamen komunitas Sabtu ini",
      "body": "Daftar sebelum Jumat, 20.00 WIB.",
      "context": "Sumber dan detail pencarian Canox"
    }
  ]
}
```

Hengs hanya menaruhnya sebagai draft di `🎛️・bot-settings`. Owner dan role dalam `OPS_EDITOR_ROLE_IDS` dapat mengubah manual lewat **Edit** atau meminta AI **Perpendek** dan **Regenerate**. Hanya owner yang dapat memilih **Publish Now**, **Jadwalkan**, **Batalkan Jadwal**, atau **Discard**. Jadwal menerima `HH:mm` atau `YYYY-MM-DD HH:mm` dalam WIB dan tetap tersimpan setelah bot restart. Isi `OWNER_ID`, `BOT_SETTINGS_CHANNEL_ID`, dan `ANNOUNCE_CHANNEL_ID` di `.env`; biarkan `OPS_EDITOR_ROLE_IDS` kosong sampai role moderator siap. Jika ID ruang review belum diisi, fallback hanya menerima nama channel persis `🎛️・bot-settings` atau `bot-settings`—tidak pernah channel bot umum.

Setiap draft Canox wajib punya `id` unik. Canox harus menulis JSON ke file sementara terlebih dahulu, lalu melakukan rename atomik menjadi `canox-ops-inbox.json`; ini mencegah Hengs membaca file yang baru ditulis setengah. Ops Hub menyimpan status lokal di `data/ops-state.json`, menolak external ID yang sama, serta memakai lock terpisah untuk revisi dan publish. Selama AI merevisi, semua tombol dinonaktifkan; kegagalan atau restart mengembalikan draft asli ke status pending. Worker jadwal mengklaim satu draft sebelum mengirim, lalu mencoba ulang setelah 1 menit dan 5 menit bila pengiriman gagal. Setelah tiga kegagalan, draft kembali ke pending untuk direview owner. Maksimal 20 versi draft dan 500 tindakan audit disimpan lokal. `/ops history` hanya menampilkan tindakan, ID draft, pelaku, dan waktu—tidak menyalin isi draft.

Untuk verifikasi lokal tanpa mendaftarkan command ke Discord:

```bash
npm test
npm run verify:server
```

`verify:server` hanya membaca Discord API. Pemeriksaan ini tidak mengirim pesan,
mengubah role, atau mendaftarkan slash command; hasilnya mencakup channel operasional,
permission bot, role hierarchy, owner, dan keberadaan pesan reaction-role.

### Runtime health

Saat proses berjalan, Hengs menulis `data/runtime-health.json` setiap 30 detik dengan
atomic rename. Snapshot berisi versi, uptime, heartbeat, status koneksi Discord, dan
kode masalah terbatas. Token, ID Discord, nama server, pesan, draft, dokumen, path,
serta error mentah tidak disimpan.

Single-instance lock juga memiliki heartbeat 30 detik. Lock yang tidak diperbarui lebih
dari lima menit dapat dipulihkan, sehingga PID Windows yang sudah hilang tetapi salah
terbaca `EPERM` tidak membuat launcher terjebak restart selamanya.

Consumer lokal wajib memeriksa freshness: Hengs hanya boleh dianggap online ketika
status `CONNECTED` dan heartbeat belum melewati 90 detik. Schema lengkap dan aturan
stale ada di [`docs/RUNTIME-HEALTH.md`](docs/RUNTIME-HEALTH.md). Lokasi dapat diubah
melalui `HENGS_RUNTIME_HEALTH_FILE`, tetapi jangan diarahkan ke folder publik.

### Community Operations Dashboard

Gunakan `/ops overview` untuk melihat satu ringkasan privat tentang runtime Hengs,
pekerjaan Ops Hub, Event Hub, antrean penerjemah, dan mode fokus. Command ini hanya
dapat dipakai owner atau role dalam `OPS_EDITOR_ROLE_IDS`, memakai respons ephemeral,
dan tidak menjalankan tindakan otomatis.

Dashboard hanya membaca angka agregat dan status allowlist. Isi draft, judul event,
daftar RSVP, nama/ID anggota, nama file, topik fokus, dokumen, token, serta error mentah
tidak dimasukkan ke embed. Jika satu state store rusak atau tidak dapat dibaca, bagian
tersebut ditandai tidak tersedia sementara bagian lain tetap tampil. Kontrak lengkap
ada di [`docs/COMMUNITY-OPERATIONS.md`](docs/COMMUNITY-OPERATIONS.md).

Token Discord = **rahasia**. Kalau pernah ke-share di mana pun (chat, screenshot, commit), langsung **Reset Token** di Developer Portal. File `.env` & folder `data/` otomatis di-ignore Git.

### Community Event Hub

Gunakan `/event draft` untuk menyiapkan event di ruang privat `bot-settings`. Waktu
menerima `HH:mm` atau `YYYY-MM-DD HH:mm` dalam WIB. Owner harus menekan **Publish
Event** sebelum event muncul di announcements. Owner dan role `OPS_EDITOR_ROLE_IDS`
dapat merevisi draft langsung dari panel lewat **Edit Detail** serta **Kapasitas &
Sumber**, tetapi hanya owner yang dapat Publish, Discard, atau Cancel. Setiap modal
membawa nomor revisi sehingga form lama tidak dapat menimpa perubahan yang lebih baru.
Draft yang jadwalnya sudah lewat ditolak saat Publish dan harus diperbarui ke waktu
yang masih akan datang.

Setelah tayang, anggota dapat memilih **Hadir**, **Mungkin**, atau **Batal RSVP**.
Satu anggota hanya memiliki satu pilihan aktif dan kapasitas hanya menghitung pilihan
Hadir. Event mengirim reminder tanpa mention pada jendela 24 jam dan 1 jam, lalu
menutup RSVP otomatis saat waktu mulai. Owner dapat membatalkan event dari panel
privat. State disimpan di `data/events-state.json`; detail teknis dan recovery ada di
`docs/EVENT-HUB.md`.

Canox juga dapat memasukkan event hasil percakapan/riset melalui inbox terpisah
`data/canox-event-inbox.json`. Inbox ini hanya membuat panel privat dan tidak memiliki
aksi Publish. Payload wajib ditulis memakai temporary file lalu atomic rename:

```json
{
  "events": [{
    "id": "event-request-unik-001",
    "title": "AI Community Meetup",
    "description": "Diskusi AI terapan untuk komunitas.",
    "start_at": "2026-08-02T19:00:00+07:00",
    "location": "General Voice",
    "capacity": 30,
    "source_url": "https://example.com/events/ai-meetup"
  }]
}
```

ID harus unik; waktu wajib masih di masa depan dan memiliki zona waktu. Kapasitas
opsional dibatasi 2-500, sedangkan referensi opsional hanya menerima HTTP(S) tanpa
credential. Seluruh payload gagal bila satu entry tidak valid. File processing yang
tertinggal akibat crash dipulihkan saat startup dan external ID mencegah panel ganda.

### Restricted document translation

Gunakan:

```text
/translate file:<attachment> to:<bahasa> non_sensitive:true
```

DeepL mendeteksi bahasa sumber otomatis. Bahasa tujuan dipilih lewat autocomplete; `Indonesian (ID)` menerjemahkan semua bahasa sumber yang didukung akun DeepL ke bahasa Indonesia. Bahasa di luar daftar dukungan DeepL tetap tidak dapat diproses.

Fitur ini memakai runtime allowlist `TRANSLATE_ALLOWED_USER_IDS`; `OWNER_ID` selalu otomatis diizinkan. Semua respons dan hasil bersifat ephemeral. File hanya berada di folder temp selama proses, tidak dicatat ke log, dan dihapus setelah hasil selesai di-upload.

Karena key saat ini DeepL API Free, command hanya untuk dokumen **non-sensitif**. Jangan unggah data pribadi, kontrak, keuangan, credential, medis, atau rahasia kerja. DOCX/PPTX/PDF juga memakai minimum kuota 50.000 karakter per file. Detail validasi ada di `docs/DEEPL-DOCUMENT-VALIDATION.md`.

### Incident Report Hub

Semua member server dapat memakai `/report`. Hasil command selalu ephemeral dan panel
review hanya dikirim ke `MOD_LOG_CHANNEL_ID`; tidak ada fallback berdasarkan nama
channel. Sebelum fitur dipakai, pastikan `@everyone` tidak memiliki **View Channel**,
bot memiliki View Channel, Send Messages, Embed Links, Attach Files, dan Read Message
History, lalu isi `REPORT_MODERATOR_ROLE_IDS` bila reviewer selain owner diperlukan.
Role ini sengaja terpisah dari `OPS_EDITOR_ROLE_IDS`.

Pilihan `anonymous:true` menyembunyikan identitas pelapor dari panel bersama dan
moderator. `OWNER_ID` tetap dapat memakai **Reveal Reporter** secara ephemeral; tindakan
reveal dicatat tanpa menyalin identitas ke audit. Administrator Discord tetap merupakan
pihak tepercaya karena permission Administrator dapat melewati overwrite channel.

Bukti dibatasi ke PNG/JPEG/WEBP/GIF, MP4/WEBM, PDF, atau TXT, maksimum 8 MiB atau batas
lebih kecil dari konfigurasi/Discord. File divalidasi sebelum diunggah ulang ke panel
privat dan file sementara lokal selalu dibersihkan. Laporan selesai disimpan selama
`REPORT_RETENTION_DAYS` (default 30 hari), lalu panel dan state dihapus dengan recovery
jika Discord sementara gagal. Hengs tidak mengirim DM, pengumuman publik, atau hukuman
otomatis; keputusan tetap pada manusia. Kontrak operator lengkap ada di
[`docs/REPORT-HUB.md`](docs/REPORT-HUB.md).

### Private WhatsApp recovery alerts

Hengs Discord membaca antrean lokal atomik dari Hengs WhatsApp. Alert dikirim ke DM
`OWNER_ID` terlebih dahulu; bila DM gagal, fallback hanya boleh ke channel persis
`BOT_SETTINGS_CHANNEL_ID` di `DISCORD_GUILD_ID`. Bot tidak mencari channel berdasarkan
nama dan tidak pernah jatuh ke channel publik.

Event yang didukung hanya `QR_REQUIRED`, `AUTH_FAILED`, `RECOVERY_RESTART`, dan
`CONNECTED`. Konsumer menggabungkan event yang terselesaikan saat Discord offline,
menahan duplikat, memakai retry terbatas, dan hanya mengirim notifikasi pulih setelah
masalah sebelumnya benar-benar terkirim. Gambar QR, isi chat, nomor kontak, token, path,
dan raw error tidak pernah masuk antrean atau pesan Discord. Lokasi default bersama adalah
`HenryLabs/Hengs/.runtime/wa-recovery-alerts`; `HENGS_ALERT_BRIDGE_DIR` hanya untuk
override lokal lanjutan.

### Deterministic Anti-Raid

Anti-Raid bukan pengganti `/report`. Report Hub tetap jalur review manusia untuk
harassment, percakapan ambigu, dan laporan komunitas; tidak ada hukuman otomatis dari
laporan. Anti-Raid hanya bereaksi pada aturan deterministik berkeyakinan tinggi untuk
domain yang diblokir, pengulangan lintas channel, atau banjir attachment. Ia tidak
mengirim isi pesan, attachment, atau URL ke AI, layanan reputasi URL, Canox, maupun
Hengs WhatsApp.

Sebelum mode `active` dipakai, isi `OWNER_ID`, `MOD_LOG_CHANNEL_ID`, dan bila perlu
`MODERATION_ROLE_IDS` / `ANTI_RAID_BLOCKED_DOMAINS`. `mod-logs` harus privat dari
`@everyone`; bot memerlukan View Channel, Send Messages, Embed Links, Read Message
History, Ban Members, dan Manage Messages. Bila salah satu prasyarat keamanan gagal,
Hengs berubah menjadi monitor-only dan tidak melakukan penghapusan atau ban.

`/mod status` menampilkan Mode tersimpan dan Mode efektif, label prasyarat aman,
snapshot tracker (guild/member/observasi), serta hitungan final insiden. `/mod incidents`
menampilkan hingga 10 insiden per halaman dengan usia, member ID non-mention,
trigger/status, jumlah pesan/kanal yang dibatasi, dan link panel hanya bila ID valid.
Tombol Sebelumnya, Segarkan, dan Berikutnya memeriksa ulang izin serta menjepit halaman
yang sudah kedaluwarsa. Owner mengatur pengecualian melalui `/mod allow`; aksi `list`
menampilkan maksimal 10 nilai aman. Moderator yang didaftarkan hanya dapat melihat
status dan insiden. Panduan ambang, privasi, recovery, dan acceptance live tersedia di
[`docs/ANTI-RAID.md`](docs/ANTI-RAID.md).

### Private moderation queue

Gunakan `/reports` untuk melihat laporan berstatus open atau claimed. Command ini hanya
dapat dipakai `OWNER_ID` dan role dalam `REPORT_MODERATOR_ROLE_IDS`; izin diperiksa
lagi pada setiap Cek Lagi, Sebelumnya, dan Berikutnya. Saat antrean kosong, copy menjelaskan
bahwa belum ada laporan dan apa yang perlu dilakukan berikutnya. Hanya owner yang melihat
**Lihat Contoh**. Preview tersebut memakai data sintetis tetap, tetap ephemeral, tidak
membaca atau menulis state laporan, tidak mengirim panel ke mod-log, dan tidak menyediakan
tombol tindakan moderator.

Antrean menampilkan maksimum 10 laporan per halaman, diurutkan dari yang paling lama.
Priority hanya menjadi tie-break untuk waktu yang sama: Mendesak, Penting, lalu Normal.
Default category adalah Penting untuk harassment, spam/scam, dan inappropriate; category
lain dimulai dari Normal. Reviewer dapat mengganti priority lewat panel dengan revision
compare-and-set sehingga klik lama atau dua moderator bersamaan tidak menimpa state baru.

Queue hanya memuat Report ID, status, priority, category, usia relatif, claimant, dan
tautan panel yang tervalidasi. Detail laporan, pelapor, target, link pesan, bukti, final
note, dan audit tidak masuk queue. Semua respons bersifat ephemeral, pagination dibatasi,
dan mention parsing dimatikan.

Anti-Raid adalah boundary terpisah v1.13.0 yang sudah tersedia secara lokal. Ia tidak mengubah alur Report Hub: laporan tetap human review, sedangkan enforcement Anti-Raid hanya mengikuti trigger deterministik dan prasyarat fail-closed.

---

Dibuat oleh **Henry** · untuk server komunitas Henzzz.
