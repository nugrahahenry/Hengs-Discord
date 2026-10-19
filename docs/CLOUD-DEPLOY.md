# Hengs Discord Always Free Deployment

Panduan ini adalah kontrak operasi Hengs Discord di Ubuntu. Cloud production saat ini menjalankan
v1.62.0 (accepted 2026-10-18). Deployment berikutnya, perubahan billing, dan cutover tetap memerlukan persetujuan Henry
pada saat tindakan dilakukan.

Prinsip utamanya adalah **one Discord token consumer**: hanya satu proses, lokal atau
cloud, yang boleh memakai token Discord pada satu waktu. Deployment tidak mengubah mode,
permission, atau kebijakan Anti-Raid. v1.62.0 aktif/enabled sebagai satu-satunya consumer
Discord setelah restart terkontrol; v1.61.0 tetap tersedia sebagai rollback. Kandidat Node22
lulus 691 tes, nol gagal, dengan tiga tes checkout-only dilewati dari arsip produksi (694 total).
Dua heartbeat bergerak lulus. News schema2 dimigrasikan atomik ke schema3 ketika service
berhenti, dengan owner/mode file, pengaturan dan riwayat tetap. Rollback wajib menjalankan
`downgradeState` tervalidasi sebelum binary lama dimulai. Jangan memulihkan snapshot receipt
lama. Downgrade ke schema1 menggabungkan receipt per hari. Staging sudah dibersihkan.
Deskripsi aplikasi sudah memuat link invite publik terverifikasi, tanpa mengubah izin instalasi.

v1.62.0 memisahkan tujuan news/memes dan menambah kiriman anggota melalui preview privat.
Exact committed code `86de70314dc8673a838d9bc3c0e2dd4a7df2bd6e` sudah live; migration menambah
`memeChannelId: null` tanpa mengubah mode/owner atau receipt. Henry juga menyetujui setup
channel terpisah dan posting anggota. Pada 2026-10-19, owner menjalankan alur UI terbatas
`/admin setup` -> News + memes, lalu preview dan terapkan routing terpisah. News tetap
active/tested; receipt lama dipertahankan. Kedua channel berada di Announcements, bukan
Bot Center. Izin native view/history/send/files/embed diperiksa read-only; bukan klaim uji
akun anggota lain. Preview joke privat lalu Batal lulus tanpa kiriman publik. Preview berita
tidak menemukan item segar dan tidak mengarang isi. Jadwal tetap maksimal dua berita pada
08:00/09:00 dan satu hiburan pada 10:00 WIB; slot kosong dilewati. Tidak ada restart/deploy
tambahan. Jangan mengirim test di news/memes; dogfooding tetap di bot-commands.
Rollback ke v1.61.0 wajib memakai `downgradeState(currentState, 2)` dari kandidat, mempertahankan
receipt mutakhir dan menjeda jadwal yang memuat hiburan. Validasi file dengan kode target sebelum
start binary lama; jangan mengembalikan backup receipt yang lebih tua. Route meme akan dilepas
oleh downgrade. Dua heartbeat dan batas single-consumer tetap wajib. Tidak perlu registrasi
slash command baru, QR, reboot, restart WA/Canox, atau uji kiriman nyata untuk migrasi ini.

Pada acceptance v1.60.0, poster Crown Stage dan sertifikat asli terverifikasi di channel
bot, termasuk checksum sertifikat dan inspeksi visual Discord. Setelah persetujuan lanjutan Henry,
satu channel Hall of Fame dibuat di Community dan satu posting final diterbitkan oleh Hengs.
Anggota dapat membaca, memberi reaksi dan berdiskusi di thread; posting utama hanya bot/admin.
Tidak ada kiriman ke announcements atau perubahan routing draft Ops umum. Upload sertifikat ini memakai operator
satu-kali; bukan bukti alur unggah sertifikat umum atau form Edit sudah diuji live.
News terpasang
dan satu kiriman uji berhasil pada 2026-10-16. Jadwal home guild diaktifkan atas persetujuan Henry
pada hari yang sama, kemudian direvisi lewat preview privat dan `terapkan berita`: teknologi, AI
dan komik, 08:00 WIB, santai, maksimal dua berita + satu hiburan/satu artikel per penerbit.
Preview v1.58.0 benar-benar memilih dua berita dan satu komik dengan sumber/gambar; dua berita
memakai fallback bahasa sumber, bukan bukti keberhasilan ringkasan Indonesia. Apply mempertahankan
tested/active dan receipt hari itu tanpa publikasi tambahan. Pengiriman harian pertama belum
teramati. Sejak v1.61.0, tiga item dijadwalkan terpisah pukul 08:00, 09:00 dan 10:00 WIB,
dengan jarak minimal satu jam dan tanpa catch-up slot yang terlewat. Tidak ada kiriman nyata
untuk menguji deployment ini. Scheduler berjalan di proses Discord cloud, bukan automation Codex baru.
WA v0.46.0 dan Canox memory-only v0.178.0 tidak direstart;
integrasi memori privat tetap aktif. Registrasi historis v1.28.0 mempertahankan `/hengs`,
menambahkan `/setup dashboard` ke schema global, serta mempertahankan 12 command lama di home guild.

Bagian bootstrap, transfer, initial cutover dan reboot di bawah adalah runbook setup awal,
bukan langkah yang harus diulang setiap update. Untuk upgrade existing, kandidat diuji sebelum
Discord dihentikan, pointer diganti atomik dengan auth/state/config tetap, lalu dua heartbeat
bergerak minimal 30 detik diverifikasi. Jangan me-reboot, me-restore, mendaftarkan command,
atau mengaktifkan jadwal berita hanya karena deployment disetujui. Bukti rilis ada di HANDOFF.md.

## Canonical Paths

| Fungsi | Path |
| --- | --- |
| Secret runtime | `/etc/hengs/discord.env` |
| State persisten | `/var/lib/hengs-discord/data` |
| Release immutable | `/opt/hengs/discord-bot/releases/<release-id>` |
| Pointer aktif | `/opt/hengs/discord-bot/current` |
| Backup terenkripsi | `/var/backups/hengs-discord` |
| Single-instance lock | `/run/hengs-discord/instance.lock` |

## Prerequisites

- Checkout Git bersih dan checkpoint rilis yang disetujui sudah di-commit.
- Node.js 22 untuk acceptance kandidat produksi; arsip wajib berasal dari exact committed HEAD.
- Akun Oracle Cloud dengan home region dan entitlement Always Free yang telah dicek
  ulang di Console. Hentikan proses bila label biaya atau entitlement tidak jelas.
- OCI CLI yang sudah terautentikasi, SSH public key, dan konfigurasi acquisition lokal.
  A1 memakai `.cloud/oracle-acquisition.json`; E2 Micro memakai direktori terpisah
  `.cloud/e2/oracle-acquisition.json` agar state dan lock kedua shape tidak bercampur.
- Ubuntu VM dengan akses SSH berbasis key. Password SSH dan TLS bypass dilarang.
- `age` recipient untuk setiap backup yang akan disimpan di luar VM.

Jangan simpan OCID, alamat host, nama Tailscale, private key, token, atau isi secret di
Git, issue, chat, screenshot, maupun log acceptance.

## OCI Preflight

Pilih tepat satu template lalu salin ke lokasi `.cloud/` yang di-ignore:

- `deploy/cloud/oracle-acquisition.example.json` untuk A1 Flex;
- `deploy/cloud/oracle-e2-acquisition.example.json` untuk E2 Micro.

A1 adalah flexible shape sehingga config menyertakan OCPU dan RAM. E2 Micro adalah fixed shape;
config E2 tidak boleh memuat `ocpus` atau `memoryInGBs`, dan launch E2 tidak mengirim
`--shape-config`. Isi referensi akun secara lokal, lalu jalankan pemeriksaan read-only:

Jika antivirus atau proxy lokal memakai CA tepercaya tambahan, arahkan OCI CLI ke CA
bundle tersebut melalui `OCI_CLI_CERT_BUNDLE`. Jangan pernah memakai TLS bypass:

```powershell
[Environment]::SetEnvironmentVariable('OCI_CLI_CERT_BUNDLE', 'C:\path\to\trusted-ca-bundle.pem', 'User')
```

```powershell
node scripts/cloud/oci-acquire.js preflight --config .cloud/oracle-acquisition.json
node scripts/cloud/oci-acquire.js status --config .cloud/oracle-acquisition.json

node scripts/cloud/oci-acquire.js preflight --config .cloud/e2/oracle-acquisition.json
node scripts/cloud/oci-acquire.js status --config .cloud/e2/oracle-acquisition.json
```

Preflight memfilter shape berdasarkan image yang dipilih agar kompatibilitas image/shape ikut
diperiksa secara read-only. Preflight dan acquisition harus berhenti untuk kegagalan autentikasi,
permission, quota, billing, shape, image, subnet, public key, throttling, timeout, atau error tidak dikenal.
Hasil operator dibatasi ke kode tetap berikut untuk kegagalan proses CLI:

- `TIMEOUT`: proses OCI CLI melewati batas waktu;
- `CLI_ERROR_UNSTRUCTURED`: CLI keluar gagal tanpa error JSON terstruktur yang dipercaya;
- `CLI_OUTPUT_INVALID`: CLI keluar sukses tetapi stdout bukan JSON yang valid.
- `PROVIDER_UNAVAILABLE`: provider mengembalikan error terstruktur 5xx yang belum dikenal;
- `PROVIDER_ERROR`: provider mengembalikan kode terstruktur non-5xx yang belum dikenal.

Raw stdout, stderr, dan pesan error tidak ditampilkan atau disimpan ke state. Entri `UNKNOWN`
yang sudah ada adalah catatan legacy dan tidak membuktikan penyebab provider tertentu. Jangan
lanjut ke `attempt` atau `run` sebelum hasil aman ditinjau dan pembuatan VM disetujui.

## Bounded Acquisition

Hanya kode OCI terstruktur `OutOfHostCapacity` yang boleh dicoba ulang. Kebijakannya:

- maksimal 8 attempt per hari lokal;
- jarak minimal 90 menit ditambah jitter sampai 15 menit;
- berhenti setelah 7 hari;
- berhenti langsung saat berhasil atau saat menerima kegagalan non-capacity;
- state dan lock berada di `.cloud/` dan tidak boleh dihapus untuk mengakali batas;
- setiap shape memakai direktori config/state sendiri; `STATE_CONFIG_MISMATCH` menghentikan
  acquisition sebelum preflight atau launch bila alias region/shape tidak cocok;
- status `STOPPED` hanya boleh di-reset setelah diagnosis ditinjau dan approval baru diberikan.

`LaunchInstance` selalu dipanggil dengan `--no-retry`, sehingga satu invocation acquisition
tidak disubmit ulang secara implisit oleh OCI CLI. Retry kapasitas hanya boleh terjadi sebagai
attempt baru yang tercatat, melewati interval kebijakan, dan memiliki approval yang sesuai.

Setelah persetujuan resource creation diberikan, jalankan salah satu mode berikut:

```powershell
node scripts/cloud/oci-acquire.js attempt --config .cloud/oracle-acquisition.json
node scripts/cloud/oci-acquire.js run --config .cloud/oracle-acquisition.json

node scripts/cloud/oci-acquire.js attempt --config .cloud/e2/oracle-acquisition.json
node scripts/cloud/oci-acquire.js run --config .cloud/e2/oracle-acquisition.json
```

Sesudah instance tersedia, cek di Console bahwa instance dan boot volume benar-benar
masuk entitlement Always Free. Status yang meragukan berarti STOP, bukan asumsi gratis.

## Host Bootstrap

Transfer folder `deploy/linux/` dari checkout yang sudah direview. Di VM Ubuntu:

```bash
sudo bash deploy/linux/install-host.sh
```

Installer memasang Node 22 dan Tailscale dari repository bertanda tangan, serta CA,
`tar`, `age`, dan UFW. Ia membuat user non-login `hengs-discord`, memasang unit systemd,
menolak inbound secara default, dan tetap membiarkan bootstrap SSH terbuka. Installer
tidak menyalakan bot dan tidak menimpa secret yang sudah ada.

Login Tailscale dilakukan interaktif. Pastikan administrasi lewat jaringan privat telah
berfungsi sebelum memperketat akses SSH publik. Jangan otomatis menutup satu-satunya
jalur pemulihan.

## Secret Transfer

Transfer secret secara terpisah dari release ke temporary root-owned file. Pasang ke
`/etc/hengs/discord.env` dengan owner `root`, group `hengs-discord`, dan mode `0640`,
lalu hapus file transfer. Verifikasi hanya nama variable dan permission, bukan nilainya.

Cloud wajib menambahkan konfigurasi berikut secara rahasia:

```dotenv
HENGS_INSTANCE_LOCK_FILE=/run/hengs-discord/instance.lock
HENGS_WA_RECOVERY_ALERTS_ENABLED=false
```

Never put `.env` in a release archive. Release dibuat hanya dari committed `HEAD`;
secret tidak boleh berada di Git atau output build.

## State Transfer

Dengan bot lokal masih menjadi satu-satunya consumer, buat snapshot state ke path
absolut lokal:

```powershell
node scripts/cloud/state-transfer.js snapshot --data-dir C:\absolute\path\data --output C:\absolute\path\hengs-state.tar
node scripts/cloud/state-transfer.js verify --archive C:\absolute\path\hengs-state.tar --manifest C:\absolute\path\hengs-state.tar.manifest.json
```

Snapshot hanya berisi JSON persisten yang diizinkan. Runtime health, lock, log, inbox
sementara, dan symlink dikeluarkan. Lakukan restore rehearsal ke folder staging di VM,
bukan ke state produksi:

```bash
node scripts/cloud/state-transfer.js restore \
  --archive /root/hengs-state.tar \
  --manifest /root/hengs-state.tar.manifest.json \
  --target-dir /var/lib/hengs-discord/state-rehearsal \
  --uid "$(id -u hengs-discord)" \
  --gid "$(id -g hengs-discord)"
```

Production restore under `/var/lib/hengs-discord` requires both `--uid` and `--gid`;
the CLI fails closed if either value is omitted.

Bandingkan manifest/checksum, lalu hapus rehearsal. Final restore baru dilakukan saat
bot lokal dan cloud sama-sama berhenti pada fase cutover.

## Deploy Release

Setelah checkpoint di-commit dan working tree tracked bersih:

```powershell
node scripts/cloud/build-release.js
```

Transfer arsip dan file `.sha256` yang dihasilkan ke VM. Dengan service masih berhenti:

```bash
sudo bash deploy/linux/deploy-release.sh \
  /root/hengs-discord-1.40.0-<commit>.tar.gz \
  /root/hengs-discord-1.40.0-<commit>.tar.gz.sha256
```

Deployer memvalidasi checksum dan path archive, menolak symlink/hardlink, menjalankan
`npm ci`, `npm test`, dan prune dependency produksi, menghubungkan state persisten,
lalu memindahkan pointer `current` secara atomik. Script sengaja tidak menjalankan
service supaya token lokal tetap menjadi satu-satunya consumer.

## Health Verification

Sesudah service memang diizinkan untuk aktif:

```bash
sudo systemctl status hengs-discord.service --no-pager
sudo bash deploy/linux/inspect-health.sh
```

Health lulus hanya bila systemd aktif, schema dan service cocok, connection berstatus
`CONNECTED`, dan heartbeat tidak lebih tua dari 90 detik. Output inspector dibatasi ke
version, state, code, dan bucket usia; raw error atau data Discord tidak dicetak.

## Production Cutover

Cutover memerlukan approval baru. Urutannya tidak boleh dibalik:

1. Pastikan cloud release terpasang tetapi service cloud berhenti.
2. Pastikan rollback lokal dan release cloud sebelumnya tersedia.
3. Stop bot local **before** start cloud, lalu buktikan tidak ada proses lokal tersisa.
4. Buat final snapshot, verifikasi, transfer, dan restore state dengan cloud masih stop.
5. Aktifkan autostart hanya setelah local consumer terbukti berhenti, lalu start cloud:

   `sudo systemctl enable hengs-discord.service`

   `sudo systemctl start hengs-discord.service`

   Tunggu dua heartbeat sehat berjarak minimal 30 detik.
6. Lakukan acceptance read-only: bot online, guild/channel sesuai, command termuat, dan
   tidak ada pesan atau tindakan moderasi tak terduga.

v1.28.0 mempertahankan subcommand global `/setup dashboard` yang ditambahkan v1.27.0, sehingga
registrasi command wajib dilakukan tepat satu kali setelah release sehat. Acceptance memeriksa
channel picker `/setup start`, Control Center, dan menu Settings secara privat tanpa menyimpan
konfigurasi uji ke server yang tidak diotorisasi. Jangan mengubah mode Anti-Raid selama acceptance.

## Reboot Verification

Restart service, lalu ulangi dua heartbeat dan acceptance read-only. Setelah itu reboot
VM, sambungkan kembali melalui Tailscale, dan ulangi pemeriksaan. Kegagalan pada salah
satu tahap berarti service cloud dihentikan dan prosedur rollback dijalankan.

## Rollback

Rollback cloud ke sibling release yang sudah ada:

```bash
sudo bash deploy/linux/rollback.sh 1.39.1-<12-char-commit>
```

Script menghentikan service, mengganti pointer, menyalakan release tujuan, lalu memeriksa
health. Jika health gagal, service dibiarkan berhenti.

Rollback ke laptop mengikuti aturan kebalikan: stop dan disable cloud **before** start local, buktikan
tidak ada proses cloud tersisa, lalu mulai bot lokal dan tunggu dua heartbeat sehat.
Jangan menyalakan lokal selama ada kemungkinan cloud masih memakai token.

## Encrypted Backup

Snapshot yang keluar dari VM wajib dienkripsi memakai recipient `age`:

```bash
node scripts/cloud/state-transfer.js encrypt \
  --archive /var/backups/hengs-discord/hengs-state.tar \
  --output /var/backups/hengs-discord/hengs-state.tar.age \
  --recipient age1<public-recipient>
```

Verifikasi file terenkripsi sebelum menghapus sumber plaintext. Simpan recipient publik
dan kunci pemulihan di tempat berbeda. Jangan pernah membuat fallback plaintext ketika
`age` tidak tersedia.

## Incident Response

- **Service aktif tetapi health gagal:** stop service, simpan hanya fixed error code,
  periksa permission secret/state dan journal secara privat, lalu rollback.
- **Token overlap dicurigai:** stop cloud terlebih dahulu, buktikan proses nol, rotasi
  token bila perlu, baru hidupkan satu consumer yang dipilih.
- **Secret terekspos:** stop service, rotasi credential di vendor, ganti secret file,
  dan jangan menyalin nilai lama ke tiket atau log.
- **State rusak:** biarkan service stop, verifikasi snapshot/manifest, restore atomik,
  lalu lakukan health check sebelum acceptance Discord.
- **VM ditarik atau capacity hilang:** jalankan rollback lokal. Jangan otomatis pindah ke
  layanan berbayar atau free trial.
- **Biaya atau entitlement meragukan:** stop workload dan periksa Console. Jangan lanjut
  berdasarkan perkiraan.

Catatan acceptance harus menyimpan timestamp, release ID, fixed result code, dan hasil
heartbeat/reboot/rollback saja. OCID, IP, hostname privat, token, Discord ID, path lokal,
raw exception, dan isi state tidak masuk dokumentasi publik.
