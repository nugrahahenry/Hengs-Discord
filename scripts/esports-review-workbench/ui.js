'use strict';

function mountWorkbench(samples) {
  const $ = id => document.getElementById(id);
  const states = { MISSING: 'Belum terbaca', INVALID: 'Tidak valid', UNREVIEWED: 'Belum dicek',
    CONFIRMED: 'Sesuai sumber', CORRECTED: 'Dikoreksi', DRAFT: 'Belum dikonfirmasi' };
  const sessions = samples.map(sample => ScoreboardWorkbench.createSession(sample));
  let game = 0, selected = 0, imageReady = false;
  const groups = [{ name: 'Hasil pertandingan', start: 0, end: 3 }];
  for (let side = 0; side < 2; side++) {
    const start = 3 + side * 28, title = side ? 'Kanan' : 'Kiri';
    groups.push({ name: `Tim ${title.toLowerCase()}`, start, end: start + 3 });
    for (let row = 0; row < 5; row++) groups.push({ name: `${title} · Pemain ${row + 1}`, start: start + 3 + row * 5, end: start + 8 + row * 5 });
  }
  const active = () => sessions[game];
  const sample = () => samples[game];
  const field = () => sample().packet.fields[selected];
  const notice = (message, error = false) => { $('notice').textContent = message; $('notice').classList.toggle('error', error); };
  const showError = message => { $('field-error').textContent = message; $('value').setAttribute('aria-invalid', String(Boolean(message))); };
  const groupIndex = () => groups.findIndex(g => selected >= g.start && selected < g.end);
  const friendly = path => ({ name: 'Nama', kills: 'Kill', deaths: 'Death', assists: 'Assist', gold: 'Gold',
    gameNumber: 'Nomor game', durationSeconds: 'Durasi', winnerIndex: 'Pemenang' })[path.split('.').at(-1)];
  const narrow = window.matchMedia('(max-width: 900px)');
  const moveEvidence = () => $(narrow.matches ? 'editor-evidence' : 'desktop-evidence').append($('crop-block'));
  narrow.addEventListener('change', moveEvidence);
  moveEvidence();
  function paintProgress() {
    const s = active().summary(), checked = s.confirmed + s.corrected;
    $('progress').textContent = `${checked} / ${s.total} kolom dicek`;
    $('download').disabled = checked === 0;
    $('download').textContent = `Unduh sampel ${game + 1}`;
    $('review-note').textContent = s.pending
      ? `${s.pending} kolom belum selesai. Bisa unduh sebagian lalu lanjut nanti. ${s.draft ? `${s.draft} edit belum dikonfirmasi dan tidak ikut diunduh.` : ''}`
      : 'Semua kolom sudah dicek. Unduh hasil, lalu jalankan validator lokal untuk memeriksa jumlah kill, gold, dan konsistensinya. Belum siap untuk publikasi.';
    const state = active().status(field().path);
    $('field-status').textContent = states[state];
    $('field-status').classList.toggle('done', ['CONFIRMED', 'CORRECTED'].includes(state));
  }
  function paintFields() {
    const section = groups[groupIndex()];
    $('fields').replaceChildren();
    for (let index = section.start; index < section.end; index++) {
      const f = sample().packet.fields[index], state = active().status(f.path);
      const button = document.createElement('button');
      button.type = 'button'; button.setAttribute('aria-current', String(index === selected));
      button.setAttribute('aria-label', `${f.title}, ${states[state]}`);
      const name = document.createElement('span'), value = document.createElement('span');
      name.textContent = friendly(f.path);
      value.className = `field-value ${['CONFIRMED', 'CORRECTED'].includes(state) ? 'done' : 'pending'}`;
      value.textContent = `${active().text(f.path) || 'Belum terbaca'}${['CONFIRMED', 'CORRECTED'].includes(state) ? ' · Dicek' : ''}`;
      button.append(name, value); button.addEventListener('click', () => select(index)); $('fields').append(button);
    }
  }
  function paintEvidence() {
    if (!imageReady) return;
    const r = sample().regions[field().path], source = sample().packet.source;
    const marker = $('highlight');
    for (const [key, value] of Object.entries({ left: r.x / source.width, top: r.y / source.height,
      width: r.width / source.width, height: r.height / source.height })) marker.style[key] = `${100 * value}%`;
    const canvas = $('crop'), scale = Math.min(3, 900 / r.width, 160 / r.height);
    canvas.width = Math.round(r.width * scale); canvas.height = Math.round(r.height * scale);
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    context.drawImage($('source-image'), r.x, r.y, r.width, r.height, 0, 0, canvas.width, canvas.height);
    $('crop-label').textContent = friendly(field().path);
  }
  function select(index, focus = false) {
    selected = Math.max(0, Math.min(sample().packet.fields.length - 1, index));
    const f = field(), definition = ScoreboardFields.fields.find(d => d.path === f.path);
    $('group').value = String(groupIndex()); $('value-label').textContent = f.title;
    $('original').textContent = f.originalValue ?? 'Belum terbaca';
    $('value').value = active().text(f.path);
    $('value').inputMode = definition.max === undefined ? 'text' : 'numeric';
    $('value-help').textContent = definition.max === undefined ? 'Tulis persis seperti di screenshot. Maksimal 80 karakter.'
      : f.path === 'winnerIndex' ? 'Isi 0 untuk tim kiri, 1 untuk tim kanan. Periksa tulisan Victory pada sumber.'
        : f.path === 'durationSeconds' ? 'Gunakan detik. Contoh 14 menit 24 detik ditulis 864.'
          : `Gunakan angka bulat ${definition.min} sampai ${definition.max}, tanpa titik atau koma.`;
    $('previous').disabled = selected === 0; $('skip').disabled = selected === sample().packet.fields.length - 1;
    $('confirm').disabled = !imageReady;
    showError(''); paintFields(); paintProgress(); paintEvidence();
    if (focus) $('value').focus({ preventScroll: true });
  }
  function setGame(index) {
    game = index; selected = 0; imageReady = false; $('confirm').disabled = true;
    $('highlight').hidden = true;
    $('source-image').src = sample().imageData;
    $('source-caption').textContent = `${sample().packet.source.event} · Screenshot ${index + 1} · Urutan pemain mengikuti sumber`;
    $('source-link').href = `${sample().packet.source.sourceUrl}&t=${sample().packet.source.videoOffsetSeconds}s`;
    [...$('games').children].forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    select(0); notice('Perubahan hanya ada di tab ini. Unduh review sebelum menutup halaman.');
  }
  samples.forEach((_, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = `Sampel ${index + 1}`;
    button.addEventListener('click', () => setGame(index)); $('games').append(button);
  });
  groups.forEach((group, i) => { const option = document.createElement('option'); option.value = String(i); option.textContent = group.name; $('group').append(option); });
  $('group').addEventListener('change', () => select(groups[Number($('group').value)].start));
  $('source-image').addEventListener('load', () => { imageReady = true; $('highlight').hidden = false; $('confirm').disabled = false; paintEvidence(); });
  $('source-image').addEventListener('error', () => { imageReady = false; $('confirm').disabled = true; notice('Screenshot gagal dibuka. Jangan konfirmasi nilai tanpa sumber. Buka ulang file HTML yang lengkap.', true); });
  $('value').addEventListener('input', () => { active().edit(field().path, $('value').value); showError(''); paintProgress(); paintFields(); });
  $('editor').addEventListener('submit', event => {
    event.preventDefault(); if (!imageReady) return;
    try { active().confirm(field().path); } catch {
      showError('Nilainya belum valid. Ikuti petunjuk di bawah kotak isian, atau lewati jika belum terbaca.'); return;
    }
    notice(`${field().title} sudah dikonfirmasi. Bacaan awal tetap disimpan.`);
    const last = selected === sample().packet.fields.length - 1;
    select(last ? selected : selected + 1, true);
  });
  $('previous').addEventListener('click', () => select(selected - 1, true));
  $('skip').addEventListener('click', () => select(selected + 1, true));
  $('reset').addEventListener('click', () => { active().reset(field().path); select(selected); notice('Review kolom ini direset. Bacaan awal tidak berubah.'); });
  $('download').addEventListener('click', () => {
    const review = active().exportReview(); if (!review.items.length) return;
    const blob = new Blob([JSON.stringify(review, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `sample-${String(game + 1).padStart(2, '0')}-review.json`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    active().markExported(); notice(`Unduhan sampel ${game + 1} diminta. Pastikan file tersimpan. Hanya sampel ini yang diunduh, tanpa edit yang belum dikonfirmasi.`);
  });
  $('import').addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', async () => {
    const file = $('file').files[0], targetGame = game; $('file').value = ''; if (!file) return;
    if (sessions[targetGame].dirty()) { notice('Masih ada perubahan di sampel ini. Unduh dulu dan konfirmasi atau reset edit yang tertunda sebelum membuka file lain.', true); return; }
    if (file.size > 65536) { notice('File review terlalu besar. Pilih file JSON hasil unduhan alat ini.', true); return; }
    try {
      const text = await file.text();
      if (sessions[targetGame].dirty()) throw new Error('EDIT_DURING_IMPORT');
      sessions[targetGame].importReview(text);
      if (game === targetGame) select(selected);
      notice(`Review sampel ${targetGame + 1} berhasil dibuka. Cek kembali sebelum memakai hasilnya.`);
    } catch { notice('File ditolak. Pastikan game, screenshot, dan versi bacaan awal sama. Review yang sedang dibuka tidak diubah.', true); }
  });
  window.addEventListener('beforeunload', event => { if (sessions.some(s => s.dirty())) { event.preventDefault(); event.returnValue = ''; } });
  setGame(0);
}
