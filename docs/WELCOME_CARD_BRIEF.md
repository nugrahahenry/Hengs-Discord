# Brief buat ChatGPT — Konsep Desain Welcome Card Discord

## Implementasi terpilih v1.24.0

Konsep produksi sekarang memakai **Aurora Gateway Layered Card**:

- Master hasil ImageGen: `assets/_originals/welcome-aurora-gateway-v2.png`.
- Aset produksi teroptimasi: `assets/welcome/aurora-gateway-v2.png`, tepat 900 x 280.
- Aset hanya berisi background kosmik, aurora, circuit trace, dan partikel. Teks, avatar,
  statistik, nomor member, planet, glass panel, serta border tetap digambar deterministik oleh
  Canvas.
- Welcome memakai tint violet dan cyan. Leave memakai tint magenta dan rose dari layer yang sama.
- Durasi member di bawah satu hari memakai menit dan jam. Timestamp join yang tidak tersedia
  ditampilkan sebagai `Unknown`, bukan `0d`.
- Seluruh source runtime dilarang memakai em dash dan en dash melalui regression test.

Prompt final ImageGen memakai screenshot Discord hanya sebagai referensi mood. Intinya meminta
background ultra-wide kosmik modern dengan aurora, circuit trace, star particles, dark text-safe
center, tanpa teks, logo, avatar, manusia, planet, badge, UI, atau watermark.

> Copy-paste SEMUA teks di bawah ini ke ChatGPT. Ini "prompt master" yang
> menjelaskan keadaan kita — biar GPT ngasih BEBERAPA KONSEP desain (bukan
> langsung generate 1 gambar), terus kamu yang nilai mana paling bagus.
> Konsep yang kamu pilih, nanti Hengs (aku) yang kode-in pakai canvas.

---

Kamu desainer grafis & UI senior. Bantu aku merancang **beberapa konsep** desain
*welcome card* (banner sambutan) untuk server Discord. **Jangan langsung generate
gambar** — kasih aku **3–5 konsep berbeda** yang dijelaskan SANGAT DETAIL, supaya
bisa di-implementasi secara kode. Lalu bandingkan & rekomendasikan.

**Konteks teknis (PENTING — desain harus bisa dikode):**
- Welcome card = banner PNG yang muncul otomatis tiap ada member baru join.
- Dibuat **programmatic** pakai Node.js + library `@napi-rs/canvas` (mirip HTML5
  Canvas API). Jadi yang bisa digambar: **bentuk** (lingkaran, kotak, garis, path,
  poligon), **gradient** (linear & radial), **teks** (font sans-serif/bold),
  **gambar** (foto profil member, di-crop lingkaran), **glow/shadow**, transparansi/opacity.
- **Batasan**: JANGAN pakai emoji di dalam teks canvas (jadi kotak/tofu). Ilustrasi
  rumit/karakter TIDAK bisa kecuali aku sediakan file PNG terpisah (background/ikon).
  Kalau sebuah konsep butuh aset PNG, sebutkan dengan jelas PNG apa yang aku perlu siapkan.
- **Ukuran kanvas: 900 x 280 px**, sudut membulat (rounded corners ~18px).
- Output PNG, ditampilkan sebagai *embed image* di Discord (background channel GELAP).

**Data yang tersedia untuk ditampilkan:**
- Foto profil (avatar) member — bisa dibikin bulat.
- Username (contoh: `szanzz`) + display name/handle (contoh: `Syahrul-Shinee`).
- Member ke-berapa (contoh: **#16**) & total member.
- Umur akun (contoh: `1y 1m old`) + tanggal join.
- Nama server: **Henzzz**. Warna aksen brand: **#5865F2** (Discord blurple, ungu-biru).

**Tentang server & vibe:**
Komunitas mahasiswa Sistem Informasi + gaming + tech. Anggota anak muda. Vibe yang
dimau: **modern, clean, sedikit techie/gaming, keren tapi nggak norak**. Mau yang
bikin orang baru ngerasa "wah keren nih server".

**Desain saat ini (yang mau di-upgrade):**
Tema kosmik/luar angkasa — ada starfield (bintang), avatar bulat di kiri, nama di
tengah, dan "planet" berisi nomor member (#16) di kanan dengan cincin orbit. Tapi
aku ngerasa masih kurang "wah". Boleh pertahankan tema kosmik ATAU usulkan tema baru.

**Yang aku minta dari kamu (format jawaban):**
Untuk SETIAP konsep (3–5 konsep), jelasin:
1. **Nama & tema/mood** konsep.
2. **Palet warna** (kode hex).
3. **Layout** — posisi tiap elemen (avatar, nama, handle, subtitle, member count,
   dekorasi) pakai perkiraan koordinat/area di kanvas 900x280.
4. **Elemen dekoratif** — apa aja & gimana (yang bisa digambar canvas; atau sebut
   kalau butuh PNG dariku).
5. **Tipografi** — ukuran & berat font tiap teks.
6. **Kenapa konsep ini bagus** + cocok buat siapa.

Di akhir: **bandingkan** semua konsep (kelebihan/kekurangan) & kasih **rekomendasi**
top-2 menurutmu. Ingat terus batasan canvas di atas.
