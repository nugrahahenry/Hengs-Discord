'use strict';

const https = require('node:https');
const dns = require('node:dns');
const net = require('node:net');

function publicIPv4(value) {
  if (net.isIP(value) !== 4) return false;
  const [a, b, c] = value.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99)))
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113));
}

function publicLookup(host, options, callback) {
  dns.lookup(host, { family: 4, all: true }, (error, records) => {
    if (error || !records?.length || records.some(row => !publicIPv4(row.address))) {
      callback(new Error('NEWS_DNS_REJECTED')); return;
    }
    callback(null, records[0].address, 4);
  });
}

// One bounded HTTPS GET to a fixed public host: no redirects, no compression, typed and size-capped.
function fetchBounded(url, { hosts = [], types = [], maxBytes = 0, timeoutMs = 10_000, request = https.request,
  lookup = publicLookup, userAgent = 'Hengs-News/1.0' } = {}) {
  let target;
  try { target = new URL(url); } catch { return Promise.reject(new Error('NEWS_FETCH_REJECTED')); }
  if (target.protocol !== 'https:' || target.username || target.password || target.port
    || !hosts.includes(target.hostname)) return Promise.reject(new Error('NEWS_FETCH_REJECTED'));
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let finished = false;
    const end = (error, content) => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      if (error) reject(new Error('NEWS_FETCH_FAILED')); else resolve(content);
    };
    let req;
    try {
      req = request(target.href, { method: 'GET', agent: false, lookup, family: 4, signal: controller.signal,
        headers: { 'User-Agent': userAgent, Accept: types.join(', '), 'Accept-Encoding': 'identity' } }, res => {
        const type = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (res.statusCode !== 200 || !types.includes(type)
          || (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity')
          || Number(res.headers['content-length'] || 0) > maxBytes) {
          res.destroy(); end(true); return;
        }
        let bytes = 0; const chunks = [];
        res.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > maxBytes) { res.destroy(); end(true); return; }
          chunks.push(chunk);
        });
        res.on('end', () => end(null, Buffer.concat(chunks)));
        res.on('error', () => end(true));
        res.on('aborted', () => end(true));
      });
      req.on('error', () => end(true));
      req.end();
    } catch { req?.destroy(); end(true); }
  });
}

module.exports = { publicIPv4, publicLookup, fetchBounded };
