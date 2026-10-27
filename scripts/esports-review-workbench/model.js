'use strict';

// Browser decisions remain caller-attested drafts. The Node checklist owns consistency validation.
(function (root) {
  const rules = typeof module === 'object' && module.exports ? require('../esports-scoreboard-fields') : root.ScoreboardFields;
  const fail = code => { throw new Error(code); };
  const copy = value => JSON.parse(JSON.stringify(value));
  const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  function field(path) {
    return rules.fields.find(f => f.path === path) || fail('INVALID_REVIEW_FIELD');
  }
  function regionValid(r, source) {
    return record(r) && rules.integer(r.x, source.width - 1) && rules.integer(r.y, source.height - 1)
      && rules.integer(r.width, source.width, 1) && rules.integer(r.height, source.height, 1)
      && r.x + r.width <= source.width && r.y + r.height <= source.height;
  }
  function validateReview(packet, review) {
    if (!record(review) || !['operator_visual', 'human_visual'].includes(review.reviewerKind)
      || !Array.isArray(review.items) || review.items.length > rules.fields.length) fail('INVALID_REVIEW_DECISIONS');
    if (review.candidateFingerprint !== packet.candidateFingerprint) fail('STALE_REVIEW');
    const seen = new Set();
    const items = Array.from(review.items, item => {
      if (!record(item) || seen.has(item.path)) fail('INVALID_REVIEW_FIELD');
      const definition = field(item.path);
      seen.add(item.path);
      if (!rules.valid(item.value, definition)) fail('INVALID_REVIEW_VALUE');
      if (item.imageSha256 !== packet.source.imageSha256 || !regionValid(item.region, packet.source)) fail('INVALID_REVIEW_EVIDENCE');
      return { path: item.path, value: typeof item.value === 'string' ? item.value.trim() : item.value,
        imageSha256: packet.source.imageSha256,
        region: Object.fromEntries(['x', 'y', 'width', 'height'].map(k => [k, item.region[k]])) };
    });
    return { candidateFingerprint: packet.candidateFingerprint, reviewerKind: review.reviewerKind, items };
  }
  function parseValue(path, text) {
    const definition = field(path);
    if (typeof text !== 'string' || text.length > 80) fail('INVALID_REVIEW_VALUE');
    const value = definition.max === undefined ? text.trim() : /^\d+$/.test(text.trim()) ? Number(text) : NaN;
    if (!rules.valid(value, definition)) fail('INVALID_REVIEW_VALUE');
    return value;
  }
  function createSession(sample) {
    const packet = copy(sample.packet), regions = copy(sample.regions);
    let review = { candidateFingerprint: packet.candidateFingerprint, reviewerKind: 'human_visual', items: [] };
    let exported = JSON.stringify(review);
    const drafts = new Map();
    const initial = path => packet.fields.find(f => f.path === field(path).path);
    const item = path => review.items.find(x => x.path === path);
    const current = path => item(path)?.value ?? initial(path).originalValue;
    return {
      text(path) { return drafts.get(path) ?? String(current(path) ?? ''); },
      edit(path, text) { field(path); if (typeof text !== 'string' || text.length > 80) fail('INVALID_REVIEW_VALUE'); drafts.set(path, text); },
      status(path) {
        if (drafts.has(path) && drafts.get(path) !== String(current(path) ?? '')) return 'DRAFT';
        if (item(path)) return current(path) === initial(path).originalValue ? 'CONFIRMED' : 'CORRECTED';
        return initial(path).state;
      },
      confirm(path) {
        const value = parseValue(path, this.text(path));
        const decision = { path, value, imageSha256: packet.source.imageSha256, region: regions[path] };
        review = validateReview(packet, { ...review, items: [...review.items.filter(x => x.path !== path), decision] });
        drafts.delete(path);
      },
      reset(path) { field(path); review.items = review.items.filter(x => x.path !== path); drafts.delete(path); },
      // Pending text edits are intentionally excluded. Never export a stale confirmed value behind an edit.
      exportReview() {
        return validateReview(packet, { ...review, items: review.items.filter(x => this.status(x.path) !== 'DRAFT') });
      },
      markExported() { exported = JSON.stringify(this.exportReview()); },
      dirty() { return [...drafts].some(([path]) => this.status(path) === 'DRAFT') || JSON.stringify(this.exportReview()) !== exported; },
      importReview(text) {
        if (typeof text !== 'string' || text.length > 65536) fail('INVALID_REVIEW_FILE');
        let parsed;
        try { parsed = JSON.parse(text); } catch { fail('INVALID_REVIEW_FILE'); }
        const checked = validateReview(packet, parsed); // Atomic, no partial import on invalid input.
        review = checked; drafts.clear(); exported = JSON.stringify(review);
      },
      summary() {
        const states = packet.fields.map(f => this.status(f.path));
        const count = state => states.filter(x => x === state).length;
        return { confirmed: count('CONFIRMED'), corrected: count('CORRECTED'), draft: count('DRAFT'),
          pending: states.filter(x => !['CONFIRMED', 'CORRECTED'].includes(x)).length, total: states.length };
      },
    };
  }
  const api = { createSession, validateReview, parseValue, regionValid };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScoreboardWorkbench = api;
})(globalThis);
