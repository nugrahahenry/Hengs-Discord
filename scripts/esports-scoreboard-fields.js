'use strict';

// Shared, dependency-free field rules for the offline validator and browser workbench.
(function (root) {
  const label = x => typeof x === 'string' && x.trim().length > 0 && x.length <= 80
    && /^[\p{L}\p{N} ._'()-]+$/u.test(x) && !/(?:AIza|AQ\.)[A-Za-z0-9._-]{15}/.test(x);
  const integer = (x, max, min = 0) => Number.isSafeInteger(x) && x >= min && x <= max;
  const fields = [];
  const add = (path, title, max, min = 0) => fields.push(Object.freeze({ path, title, max, min }));
  add('gameNumber', 'Nomor game', 99, 1);
  add('durationSeconds', 'Durasi dalam detik', 10800, 1);
  add('winnerIndex', 'Pemenang, 0 kiri atau 1 kanan', 1);
  for (let side = 0; side < 2; side++) {
    const base = `teams.${side}`, title = side ? 'Kanan' : 'Kiri';
    add(`${base}.name`, `Nama tim ${title.toLowerCase()}`);
    add(`${base}.kills`, `Kill tim ${title.toLowerCase()}`, 200);
    add(`${base}.gold`, `Gold tim ${title.toLowerCase()}`, 1000000);
    for (let row = 0; row < 5; row++) {
      const player = `${base}.players.${row}`, prefix = `${title} pemain ${row + 1}`;
      add(`${player}.name`, `${prefix} nama`);
      for (const [key, text] of [['kills', 'kill'], ['deaths', 'death'], ['assists', 'assist'], ['gold', 'gold']]) {
        add(`${player}.${key}`, `${prefix} ${text}`, key === 'gold' ? 200000 : 200);
      }
    }
  }
  const valid = (value, field) => field.max === undefined ? label(value) : integer(value, field.max, field.min);
  const api = Object.freeze({ fields: Object.freeze(fields), label, integer, valid });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScoreboardFields = api;
})(globalThis);
