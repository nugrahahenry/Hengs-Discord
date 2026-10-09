// welcome-card.js
// Hengs Aurora Gateway welcome and leave card renderer. (bg enhanced)
// Compatible with discord.js v14 and @napi-rs/canvas.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

let canvasLib;
try {
  canvasLib = require('@napi-rs/canvas');
} catch (error) {
  canvasLib = null;
  console.error('[welcome-card] @napi-rs/canvas is not available:', error.message);
}

const CARD = Object.freeze({
  width: 900,
  height: 280,
  radius: 18,
  brandName: 'Hengs',
});

const THEMES = Object.freeze({
  welcome: {
    primary: '#8B5CFF',
    secondary: '#35D9FF',
    tertiary: '#C66BFF',
    baseLeft: '#120B35',
    baseMiddle: '#10183A',
    baseRight: '#062D48',
    planetDark: '#17125C',
    text: '#F7F8FF',
    muted: '#B8C2DA',
    panel: 'rgba(8, 12, 35, 0.62)',
  },
  leave: {
    primary: '#D65CFF',
    secondary: '#FF7A9E',
    tertiary: '#8A5CFF',
    baseLeft: '#17091F',
    baseMiddle: '#28102D',
    baseRight: '#351321',
    planetDark: '#4B1638',
    text: '#FFF7FB',
    muted: '#D8B9C8',
    panel: 'rgba(28, 8, 24, 0.62)',
  },
});


let FONT_FAMILY = 'Arial';

function initializeFonts() {
  if (!canvasLib?.GlobalFonts) return;
  const { GlobalFonts } = canvasLib;

  try {
    if (typeof GlobalFonts.loadSystemFonts === 'function') {
      GlobalFonts.loadSystemFonts();
    }
  } catch (error) {
    console.warn('[welcome-card] System fonts could not be loaded:', error.message);
  }

  const customFontPaths = [
    process.env.HENGS_FONT_REGULAR,
    process.env.HENGS_FONT_BOLD,
  ].filter(Boolean);

  let customFontLoaded = false;
  for (const fontPath of customFontPaths) {
    try {
      if (fs.existsSync(fontPath)) {
        customFontLoaded = GlobalFonts.registerFromPath(fontPath, 'Hengs UI') || customFontLoaded;
      }
    } catch (error) {
      console.warn(`[welcome-card] Font could not be registered from ${fontPath}:`, error.message);
    }
  }

  if (customFontLoaded) {
    FONT_FAMILY = 'Hengs UI';
    return;
  }

  const availableFamilies = new Set(
    (GlobalFonts.families || []).map((entry) => safeString(entry?.family).toLowerCase()),
  );
  const preferredFamilies = [
    'Inter Display',
    'Inter',
    'Lato',
    'Noto Sans',
    'DejaVu Sans',
    'Arial',
  ];
  const selected = preferredFamilies.find((family) => availableFamilies.has(family.toLowerCase()));
  if (selected) FONT_FAMILY = selected;
}

function fontSpec(weight, size, family = FONT_FAMILY) {
  return `${weight} ${size}px "${family}"`;
}

const MONTHS = Object.freeze([
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]);

const cachedLocalImages = new Map();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function safeString(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  const text = String(value).replace(/[\r\n\t]+/g, ' ').trim();
  return text || fallback;
}

initializeFonts();

function hashString(value) {
  const text = safeString(value, 'hengs');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seedValue) {
  let state = hashString(seedValue) || 1;
  return function random() {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgba(hex, alpha = 1) {
  const normalized = safeString(hex).replace('#', '');
  const full = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized;
  const parsed = Number.parseInt(full, 16);
  if (!Number.isFinite(parsed)) return `rgba(255,255,255,${alpha})`;
  const red = (parsed >> 16) & 255;
  const green = (parsed >> 8) & 255;
  const blue = parsed & 255;
  return `rgba(${red},${green},${blue},${alpha})`;
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = clamp(radius, 0, Math.min(width, height) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillRoundedRect(ctx, x, y, width, height, radius, fillStyle) {
  ctx.save();
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.restore();
}

function strokeRoundedRect(ctx, x, y, width, height, radius, strokeStyle, lineWidth = 1) {
  ctx.save();
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();
}

function fitFont(ctx, text, options = {}) {
  const {
    maxWidth = 300,
    maxSize = 40,
    minSize = 20,
    weight = 700,
    family = FONT_FAMILY,
  } = options;

  let size = maxSize;
  while (size > minSize) {
    ctx.font = fontSpec(weight, size, family);
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 1;
  }
  ctx.font = fontSpec(weight, size, family);
  return size;
}

function truncateToWidth(ctx, text, maxWidth) {
  const clean = safeString(text);
  if (!clean || ctx.measureText(clean).width <= maxWidth) return clean;

  const suffix = '…';
  let low = 0;
  let high = clean.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = clean.slice(0, mid) + suffix;
    if (ctx.measureText(candidate).width <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return clean.slice(0, low) + suffix;
}

function wrapText(ctx, text, maxWidth, maxLines = 2) {
  const words = safeString(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) break;
  }

  if (lines.length < maxLines && current) lines.push(current);

  const consumed = lines.join(' ').split(/\s+/).filter(Boolean).length;
  if (consumed < words.length && lines.length) {
    lines[lines.length - 1] = truncateToWidth(
      ctx,
      `${lines[lines.length - 1]} ${words.slice(consumed).join(' ')}`,
      maxWidth,
    );
  }

  return lines.slice(0, maxLines);
}

function formatDate(dateValue) {
  if (dateValue === null || dateValue === undefined || dateValue === '') return 'Unknown';
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function formatDuration(startValue, endValue = new Date()) {
  if (startValue === null || startValue === undefined || startValue === '') return 'Unknown';
  const start = startValue instanceof Date ? startValue : new Date(startValue);
  const end = endValue instanceof Date ? endValue : new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 'Unknown';

  const elapsedMs = end.getTime() - start.getTime();
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 1) return '<1m';
  if (elapsedMinutes < 60) return `${elapsedMinutes}m`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  const remainingMinutes = elapsedMinutes % 60;
  if (elapsedHours < 24) {
    return remainingMinutes > 0 ? `${elapsedHours}h ${remainingMinutes}m` : `${elapsedHours}h`;
  }
  const elapsedDays = Math.floor(elapsedHours / 24);
  const remainingHours = elapsedHours % 24;
  if (elapsedDays < 31) {
    return remainingHours > 0 ? `${elapsedDays}d ${remainingHours}h` : `${elapsedDays}d`;
  }

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();

  if (days < 0) {
    months -= 1;
    const previousMonth = (end.getMonth() + 11) % 12;
    const previousMonthYear = previousMonth === 11 ? end.getFullYear() - 1 : end.getFullYear();
    days += daysInMonth(previousMonthYear, previousMonth);
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const parts = [];
  if (years > 0) parts.push(`${years}y`);
  if (months > 0) parts.push(`${months}m`);
  if (years === 0 && days > 0) parts.push(`${days}d`);
  if (!parts.length) parts.push('0d');
  return parts.slice(0, 2).join(' ');
}

function formatMemberNumber(value) {
  const number = Math.max(0, Number.parseInt(value, 10) || 0);
  if (number < 1000) return `#${String(number).padStart(3, '0')}`;
  return `#${number}`;
}

function getMemberData(member, type, options = {}) {
  const user = member?.user || {};
  const guild = member?.guild || {};
  const now = options.now instanceof Date ? options.now : new Date();

  const username = safeString(user.username, 'New Member');
  const displayName = safeString(member?.displayName || user.globalName, username);
  const createdAtValue = user.createdAt ?? user.createdTimestamp;
  const joinedAtValue = member?.joinedAt ?? member?.joinedTimestamp;
  const createdAt = createdAtValue instanceof Date ? createdAtValue : new Date(createdAtValue);
  const joinedAt = joinedAtValue instanceof Date ? joinedAtValue : new Date(joinedAtValue);
  const memberNumber = options.memberNumber ?? guild.memberCount ?? 0;
  const brandName = safeString(
    options.serverName || process.env.WELCOME_SERVER_NAME,
    CARD.brandName,
  );

  return {
    id: safeString(user.id || member?.id, username),
    username,
    displayName,
    createdAt,
    joinedAt,
    now,
    memberNumber,
    brandName,
    avatarUrl: typeof user.displayAvatarURL === 'function'
      ? user.displayAvatarURL({ extension: 'png', size: 512, forceStatic: true })
      : null,
    isLeave: type === 'leave',
  };
}

async function loadRemoteImage(loadImage, url, timeoutMs = 8000) {
  if (!url) return null;

  if (typeof fetch !== 'function') {
    return loadImage(url);
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(url, {
      signal: controller?.signal,
      headers: { 'User-Agent': 'Hengs-Discord-Bot/1.0' },
    });
    if (!response.ok) throw new Error(`Avatar request failed with ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    return loadImage(Buffer.from(arrayBuffer));
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadLocalImage(loadImage, filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const key = path.resolve(filePath);
  if (!cachedLocalImages.has(key)) {
    cachedLocalImages.set(key, loadImage(key).catch(() => null));
  }
  return cachedLocalImages.get(key);
}

function getLogoCandidates(options = {}) {
  return [
    options.logoPath,
    process.env.HENGS_LOGO_PATH,
    path.resolve(__dirname, '../../assets/henzzz_bot_icon.png'),
    path.resolve(__dirname, '../../assets/hengs-bot-icon.png'),
    path.resolve(process.cwd(), 'assets/hengs-bot-icon.png'),
  ].filter(Boolean);
}

function getBackdropCandidates(options = {}) {
  return [
    options.backgroundPath,
    process.env.HENGS_WELCOME_BACKGROUND_PATH,
    path.resolve(__dirname, '../../assets/welcome/aurora-gateway-v2.png'),
    path.resolve(process.cwd(), 'assets/welcome/aurora-gateway-v2.png'),
  ].filter(Boolean);
}

async function loadOptionalBackdrop(loadImage, options = {}) {
  for (const candidate of getBackdropCandidates(options)) {
    const image = await loadLocalImage(loadImage, candidate);
    if (image) return image;
  }
  return null;
}

async function loadOptionalLogo(loadImage, options = {}) {
  for (const candidate of getLogoCandidates(options)) {
    const image = await loadLocalImage(loadImage, candidate);
    if (image) return image;
  }
  return null;
}

function drawCoverImage(ctx, image, x, y, width, height) {
  const imageWidth = image.width || width;
  const imageHeight = image.height || height;
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (imageWidth - sourceWidth) / 2;
  const sourceY = (imageHeight - sourceHeight) / 2;
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function drawBaseBackground(ctx, width, height, theme) {
  const base = ctx.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, theme.baseLeft);
  base.addColorStop(0.52, theme.baseMiddle);
  base.addColorStop(1, theme.baseRight);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  // Nebula swirl diagonal di tengah membuat warna lebih hidup seperti aset PNG.
  const nebula = ctx.createLinearGradient(180, 0, 760, height);
  nebula.addColorStop(0, hexToRgba(theme.tertiary, 0));
  nebula.addColorStop(0.38, hexToRgba(theme.tertiary, 0.46));
  nebula.addColorStop(0.60, hexToRgba(theme.primary, 0.40));
  nebula.addColorStop(0.82, hexToRgba(theme.secondary, 0.30));
  nebula.addColorStop(1, hexToRgba(theme.secondary, 0));
  ctx.fillStyle = nebula;
  ctx.fillRect(0, 0, width, height);

  const leftAurora = ctx.createRadialGradient(150, 120, 12, 150, 120, 340);
  leftAurora.addColorStop(0, hexToRgba(theme.tertiary, 0.78));
  leftAurora.addColorStop(0.40, hexToRgba(theme.primary, 0.40));
  leftAurora.addColorStop(1, hexToRgba(theme.primary, 0));
  ctx.fillStyle = leftAurora;
  ctx.fillRect(0, 0, width, height);

  const rightAurora = ctx.createRadialGradient(795, 140, 10, 795, 140, 360);
  rightAurora.addColorStop(0, hexToRgba(theme.secondary, 0.70));
  rightAurora.addColorStop(0.44, hexToRgba(theme.primary, 0.36));
  rightAurora.addColorStop(1, hexToRgba(theme.secondary, 0));
  ctx.fillStyle = rightAurora;
  ctx.fillRect(0, 0, width, height);

  const topAurora = ctx.createLinearGradient(250, 0, 710, 230);
  topAurora.addColorStop(0, hexToRgba(theme.tertiary, 0));
  topAurora.addColorStop(0.45, hexToRgba(theme.tertiary, 0.32));
  topAurora.addColorStop(0.72, hexToRgba(theme.secondary, 0.24));
  topAurora.addColorStop(1, hexToRgba(theme.secondary, 0));
  ctx.fillStyle = topAurora;
  ctx.fillRect(0, 0, width, height);

  const vignette = ctx.createRadialGradient(width / 2, height / 2, 80, width / 2, height / 2, 560);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,12,0.40)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function drawBackdropLayer(ctx, image, width, height, theme, isLeave) {
  if (!image) return;
  ctx.save();
  ctx.globalAlpha = isLeave ? 0.54 : 0.70;
  drawCoverImage(ctx, image, 0, 0, width, height);
  ctx.globalAlpha = 1;

  const tint = ctx.createLinearGradient(0, 0, width, height);
  tint.addColorStop(0, hexToRgba(isLeave ? theme.secondary : theme.primary, isLeave ? 0.22 : 0.10));
  tint.addColorStop(0.48, 'rgba(4,8,28,0.12)');
  tint.addColorStop(1, hexToRgba(isLeave ? theme.primary : theme.secondary, isLeave ? 0.18 : 0.08));
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawIdentityGlass(ctx, theme) {
  const x = 228;
  const y = 20;
  const width = 428;
  const height = 178;
  const glass = ctx.createLinearGradient(x, y, x + width, y + height);
  glass.addColorStop(0, 'rgba(7,11,34,0.38)');
  glass.addColorStop(0.55, 'rgba(8,13,39,0.20)');
  glass.addColorStop(1, hexToRgba(theme.primary, 0.08));
  fillRoundedRect(ctx, x, y, width, height, 20, glass);
  strokeRoundedRect(ctx, x, y, width, height, 20, 'rgba(255,255,255,0.10)', 1);

  ctx.save();
  const edge = ctx.createLinearGradient(x, y, x, y + height);
  edge.addColorStop(0, hexToRgba(theme.secondary, 0.72));
  edge.addColorStop(1, hexToRgba(theme.primary, 0.06));
  ctx.fillStyle = edge;
  fillRoundedRect(ctx, x, y + 18, 3, height - 36, 2, edge);
  ctx.restore();
}

function drawAuroraStreaks(ctx, theme) {
  const streaks = [
    { y: 18, color: theme.tertiary, alpha: 0.18, width: 18 },
    { y: 35, color: theme.secondary, alpha: 0.15, width: 12 },
    { y: 252, color: theme.primary, alpha: 0.14, width: 16 },
  ];

  ctx.save();
  for (const streak of streaks) {
    ctx.strokeStyle = hexToRgba(streak.color, streak.alpha);
    ctx.lineWidth = streak.width;
    ctx.lineCap = 'round';
    ctx.shadowColor = hexToRgba(streak.color, 0.34);
    ctx.shadowBlur = 26;
    ctx.beginPath();
    ctx.moveTo(-60, streak.y + 40);
    ctx.bezierCurveTo(160, streak.y - 55, 570, streak.y + 55, 970, streak.y - 35);
    ctx.stroke();
  }
  ctx.restore();
}

function drawStars(ctx, width, height, random, theme) {
  const textSafeArea = { x1: 238, y1: 35, x2: 630, y2: 255 };
  for (let i = 0; i < 72; i += 1) {
    const x = random() * width;
    const y = random() * height;
    const inSafeArea = x > textSafeArea.x1 && x < textSafeArea.x2 && y > textSafeArea.y1 && y < textSafeArea.y2;
    const alpha = (inSafeArea ? 0.04 : 0.10) + random() * (inSafeArea ? 0.12 : 0.42);
    const radius = 0.35 + random() * 1.15;
    ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const bokeh = [
    [82, 75, 13, theme.tertiary, 0.10],
    [208, 52, 7, theme.secondary, 0.12],
    [690, 62, 15, theme.primary, 0.08],
    [846, 224, 11, theme.secondary, 0.11],
    [665, 232, 6, theme.tertiary, 0.12],
  ];
  for (const [x, y, radius, color, alpha] of bokeh) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, hexToRgba(color, alpha));
    gradient.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSparkle(ctx, x, y, size, color) {
  ctx.save();
  const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 3.4);
  glow.addColorStop(0, 'rgba(255,255,255,0.96)');
  glow.addColorStop(0.28, hexToRgba(color, 0.58));
  glow.addColorStop(1, hexToRgba(color, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, size * 3.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.98)';
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size * 0.22, y - size * 0.22);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x + size * 0.22, y + size * 0.22);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size * 0.22, y + size * 0.22);
  ctx.lineTo(x - size, y);
  ctx.lineTo(x - size * 0.22, y - size * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCornerDetails(ctx, theme) {
  ctx.save();
  ctx.strokeStyle = hexToRgba(theme.secondary, 0.46);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(24, 235);
  ctx.lineTo(24, 252);
  ctx.lineTo(41, 252);
  ctx.moveTo(28, 242);
  ctx.lineTo(51, 242);
  ctx.stroke();

  ctx.strokeStyle = hexToRgba(theme.primary, 0.45);
  ctx.beginPath();
  ctx.moveTo(835, 26);
  ctx.lineTo(870, 26);
  ctx.lineTo(870, 60);
  ctx.stroke();
  ctx.restore();
}

function drawLogoWatermark(ctx, logoImage, theme) {
  ctx.save();
  ctx.globalAlpha = 0.075;
  ctx.shadowColor = hexToRgba(theme.primary, 0.45);
  ctx.shadowBlur = 20;

  if (logoImage) {
    const size = 116;
    ctx.drawImage(logoImage, 596, 82, size, size);
  } else {
    ctx.strokeStyle = theme.primary;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(620, 96);
    ctx.lineTo(620, 180);
    ctx.moveTo(620, 125);
    ctx.lineTo(670, 125);
    ctx.moveTo(670, 96);
    ctx.lineTo(670, 180);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAvatarOrbit(ctx, x, y, radius, theme) {
  ctx.save();
  const glow = ctx.createRadialGradient(x, y, radius - 8, x, y, radius + 48);
  glow.addColorStop(0, hexToRgba(theme.primary, 0.36));
  glow.addColorStop(0.55, hexToRgba(theme.secondary, 0.13));
  glow.addColorStop(1, hexToRgba(theme.primary, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius + 48, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = hexToRgba(theme.primary, 0.65);
  ctx.shadowBlur = 15;
  ctx.strokeStyle = theme.primary;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, radius + 8, 0, Math.PI * 2);
  ctx.stroke();

  ctx.shadowBlur = 10;
  ctx.strokeStyle = theme.secondary;
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.arc(x, y, radius + 14, -0.35, Math.PI * 1.32);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = hexToRgba(theme.tertiary, 0.42);
  ctx.setLineDash([5, 7]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, radius + 25, 0.15, Math.PI * 1.76);
  ctx.stroke();
  ctx.setLineDash([]);

  const orbitAngles = [-0.95, 0.43, 2.38];
  for (let index = 0; index < orbitAngles.length; index += 1) {
    const angle = orbitAngles[index];
    const orbitRadius = radius + (index === 1 ? 14 : 25);
    const dotX = x + Math.cos(angle) * orbitRadius;
    const dotY = y + Math.sin(angle) * orbitRadius;
    ctx.fillStyle = index === 1 ? theme.secondary : theme.tertiary;
    ctx.beginPath();
    ctx.arc(dotX, dotY, index === 1 ? 4.2 : 3.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

async function drawAvatar(ctx, loadImage, data, theme) {
  const x = 132;
  const y = 142;
  const radius = 69;
  drawAvatarOrbit(ctx, x, y, radius, theme);

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();

  let image = null;
  try {
    image = await loadRemoteImage(loadImage, data.avatarUrl);
  } catch (error) {
    console.warn('[welcome-card] Avatar gagal dimuat:', error.message, '| URL:', data.avatarUrl);
  }

  if (image) {
    drawCoverImage(ctx, image, x - radius, y - radius, radius * 2, radius * 2);
  } else {
    const fallback = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
    fallback.addColorStop(0, theme.primary);
    fallback.addColorStop(1, theme.secondary);
    ctx.fillStyle = fallback;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

    const initial = Array.from(data.username)[0]?.toUpperCase() || '?';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = fontSpec(800, 54);
    ctx.fillText(initial, x, y + 2);
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.78)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, radius - 1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawPlanetOrbitBack(ctx, x, y, radius, theme) {
  ctx.save();
  ctx.strokeStyle = hexToRgba(theme.tertiary, 0.55);
  ctx.lineWidth = 2;
  ctx.shadowColor = hexToRgba(theme.primary, 0.65);
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.ellipse(x, y + 2, radius + 34, radius * 0.42, -0.22, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawPlanet(ctx, data, theme) {
  const x = 774;
  const y = 140;
  const radius = 63;

  ctx.save();
  const outerGlow = ctx.createRadialGradient(x, y, radius * 0.35, x, y, radius + 52);
  outerGlow.addColorStop(0, hexToRgba(theme.secondary, 0.32));
  outerGlow.addColorStop(0.5, hexToRgba(theme.primary, 0.18));
  outerGlow.addColorStop(1, hexToRgba(theme.primary, 0));
  ctx.fillStyle = outerGlow;
  ctx.beginPath();
  ctx.arc(x, y, radius + 52, 0, Math.PI * 2);
  ctx.fill();

  drawPlanetOrbitBack(ctx, x, y, radius, theme);

  const body = ctx.createRadialGradient(x - 23, y - 26, 4, x + 10, y + 12, radius + 22);
  body.addColorStop(0, '#EEE8FF');
  body.addColorStop(0.10, hexToRgba(theme.tertiary, 0.95));
  body.addColorStop(0.52, theme.primary);
  body.addColorStop(0.80, theme.secondary);
  body.addColorStop(1, theme.planetDark);
  ctx.fillStyle = body;
  ctx.shadowColor = hexToRgba(theme.secondary, 0.55);
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius - 2, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 7; i += 1) {
    ctx.strokeStyle = i % 2 === 0
      ? 'rgba(255,255,255,0.085)'
      : 'rgba(4,8,35,0.10)';
    ctx.lineWidth = 5 + i;
    ctx.beginPath();
    ctx.ellipse(x - 4, y - 28 + i * 10, radius * 0.88, 8 + i * 0.5, -0.16, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,255,255,0.42)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, radius - 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.80)';
  ctx.lineWidth = 2.2;
  ctx.shadowColor = hexToRgba(theme.tertiary, 0.80);
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.ellipse(x, y + 2, radius + 34, radius * 0.42, -0.22, 0, Math.PI);
  ctx.stroke();

  ctx.shadowBlur = 0;
  const dotAngle = -0.22;
  const dotX = x + Math.cos(dotAngle) * (radius + 34);
  const dotY = y + 2 + Math.sin(dotAngle) * (radius * 0.42);
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(dotX, dotY, 3.2, 0, Math.PI * 2);
  ctx.fill();

  const numberText = formatMemberNumber(data.memberNumber);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  fitFont(ctx, numberText, {
    maxWidth: radius * 1.7,
    maxSize: 44,
    minSize: 28,
    weight: 800,
  });
  ctx.shadowColor = 'rgba(0,0,20,0.65)';
  ctx.shadowBlur = 8;
  ctx.fillText(numberText, x, y - 4);

  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.86)';
  ctx.font = fontSpec(700, 10);
  ctx.fillText(data.isLeave ? 'MEMBER LEFT' : 'NEW MEMBER', x, y + 29);

  drawSparkle(ctx, x - 42, y - 55, 6.5, theme.tertiary);
  ctx.restore();
}

function drawStatIcon(ctx, type, x, y, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (type === 'calendar') {
    roundedRectPath(ctx, x, y, 22, 20, 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 5, y - 2);
    ctx.lineTo(x + 5, y + 4);
    ctx.moveTo(x + 17, y - 2);
    ctx.lineTo(x + 17, y + 4);
    ctx.moveTo(x + 1, y + 7);
    ctx.lineTo(x + 21, y + 7);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(x + 11, y + 10, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 11, y + 10);
    ctx.lineTo(x + 11, y + 4);
    ctx.moveTo(x + 11, y + 10);
    ctx.lineTo(x + 16, y + 12);
    ctx.stroke();
  }
  ctx.restore();
}

function drawStats(ctx, data, theme) {
  const x = 255;
  const y = 205;
  const width = 360;
  const height = 51;

  const panelGradient = ctx.createLinearGradient(x, y, x + width, y + height);
  panelGradient.addColorStop(0, theme.panel);
  panelGradient.addColorStop(1, 'rgba(11,15,46,0.32)');
  fillRoundedRect(ctx, x, y, width, height, 12, panelGradient);
  strokeRoundedRect(ctx, x, y, width, height, 12, hexToRgba(theme.secondary, 0.46), 1);

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + width / 2, y + 9);
  ctx.lineTo(x + width / 2, y + height - 9);
  ctx.stroke();
  ctx.restore();

  const leftLabel = data.isLeave ? 'MEMBER FOR' : 'ACCOUNT AGE';
  const leftValue = data.isLeave
    ? formatDuration(data.joinedAt, data.now)
    : formatDuration(data.createdAt, data.now);
  const rightLabel = data.isLeave ? 'LEFT' : 'JOINED';
  const rightValue = formatDate(data.isLeave ? data.now : data.joinedAt);

  drawStatIcon(ctx, data.isLeave ? 'clock' : 'clock', x + 17, y + 16, theme.secondary);
  drawStatIcon(ctx, 'calendar', x + 201, y + 16, theme.tertiary);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = theme.secondary;
  ctx.font = fontSpec(700, 10);
  ctx.fillText(leftLabel, x + 50, y + 19);
  ctx.fillStyle = theme.text;
  ctx.font = fontSpec(700, 16);
  ctx.fillText(truncateToWidth(ctx, leftValue, 112), x + 50, y + 40);

  ctx.fillStyle = theme.tertiary;
  ctx.font = fontSpec(700, 10);
  ctx.fillText(rightLabel, x + 234, y + 19);
  ctx.fillStyle = theme.text;
  ctx.font = fontSpec(700, 15);
  ctx.fillText(truncateToWidth(ctx, rightValue, 112), x + 234, y + 40);
}

function drawIdentity(ctx, data, theme, options = {}) {
  const x = 255;
  const maxTextWidth = 382;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Label kecil di atas (WELCOME TO / GOODBYE FROM)
  ctx.fillStyle = hexToRgba(theme.secondary, 0.95);
  ctx.font = fontSpec(700, 11);
  const heading = data.isLeave ? 'GOODBYE FROM' : 'WELCOME TO';
  ctx.fillText(heading, x, 40);

  // HERO: nama brand BESAR (kayak PNG)
  const brand = safeString(data.brandName, 'Hengs').toUpperCase();
  fitFont(ctx, brand, { maxWidth: maxTextWidth, maxSize: 46, minSize: 30, weight: 800 });
  const brandWidth = Math.min(360, ctx.measureText(brand).width || 200);
  const brandGradient = ctx.createLinearGradient(x, 52, x + brandWidth, 92);
  brandGradient.addColorStop(0, '#FFFFFF');
  brandGradient.addColorStop(0.55, '#E7D9FF');
  brandGradient.addColorStop(1, theme.secondary);
  ctx.fillStyle = brandGradient;
  ctx.shadowColor = hexToRgba(theme.primary, 0.5);
  ctx.shadowBlur = 14;
  ctx.fillText(brand, x, 86);
  ctx.shadowBlur = 0;

  // Username (medium, ungu) di bawah HENGS
  const username = safeString(data.username, 'New Member');
  fitFont(ctx, username, { maxWidth: maxTextWidth, maxSize: 32, minSize: 21, weight: 700 });
  ctx.fillStyle = hexToRgba(theme.tertiary, 0.98);
  ctx.shadowColor = hexToRgba(theme.primary, 0.35);
  ctx.shadowBlur = 6;
  ctx.fillText(truncateToWidth(ctx, username, maxTextWidth), x, 116);
  ctx.shadowBlur = 0;

  // Handle @displayName (kalau beda dari username)
  const hasDistinctDisplayName = data.displayName.toLocaleLowerCase() !== data.username.toLocaleLowerCase();
  let messageY = 150;
  if (hasDistinctDisplayName) {
    ctx.font = fontSpec(600, 15);
    ctx.fillStyle = hexToRgba(theme.secondary, 0.95);
    const displayHandle = truncateToWidth(ctx, `@${data.displayName}`, maxTextWidth);
    ctx.fillText(displayHandle, x, 138);
    messageY = 164;
  }

  const defaultMessage = data.isLeave
    ? `Makasih sudah jadi bagian ${data.brandName}. Semoga ketemu lagi ya.`
    : `Senang kamu gabung di ${data.brandName}. Baca aturan, ambil role, lalu kenalan. Kalau butuh bantuan, mention Hengs.`;
  const message = safeString(
    data.isLeave ? options.leaveMessage : options.welcomeMessage,
    defaultMessage,
  );

  ctx.font = fontSpec(400, 13.5);
  ctx.fillStyle = theme.muted;
  const lines = wrapText(ctx, message, maxTextWidth, 2);
  lines.forEach((line, index) => {
    ctx.fillText(line, x, messageY + index * 18);
  });
}

function drawCardBorder(ctx, width, height, theme) {
  ctx.save();
  const border = ctx.createLinearGradient(0, 0, width, height);
  border.addColorStop(0, hexToRgba(theme.primary, 0.92));
  border.addColorStop(0.48, hexToRgba(theme.tertiary, 0.56));
  border.addColorStop(1, hexToRgba(theme.secondary, 0.92));
  roundedRectPath(ctx, 1.5, 1.5, width - 3, height - 3, CARD.radius - 1.5);
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.shadowColor = hexToRgba(theme.primary, 0.38);
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.restore();
}

async function generateCard(member, type = 'welcome', options = {}) {
  if (!canvasLib) return null;

  const normalizedType = type === 'leave' ? 'leave' : 'welcome';
  const theme = THEMES[normalizedType];
  const data = getMemberData(member, normalizedType, options);
  const { createCanvas, loadImage } = canvasLib;
  const canvas = createCanvas(CARD.width, CARD.height);
  const ctx = canvas.getContext('2d');
  const [backdropImage, logoImage] = await Promise.all([
    loadOptionalBackdrop(loadImage, options),
    loadOptionalLogo(loadImage, options),
  ]);

  ctx.save();
  roundedRectPath(ctx, 0, 0, CARD.width, CARD.height, CARD.radius);
  ctx.clip();

  drawBaseBackground(ctx, CARD.width, CARD.height, theme);
  drawBackdropLayer(ctx, backdropImage, CARD.width, CARD.height, theme, data.isLeave);
  drawAuroraStreaks(ctx, theme);

  const random = createSeededRandom(`${data.id}:${normalizedType}:${data.memberNumber}`);
  drawStars(ctx, CARD.width, CARD.height, random, theme);

  drawLogoWatermark(ctx, logoImage, theme);

  drawSparkle(ctx, 63, 72, 5.4, theme.tertiary);
  drawSparkle(ctx, 680, 51, 4.2, theme.secondary);
  drawSparkle(ctx, 856, 210, 4.8, theme.secondary);
  drawCornerDetails(ctx, theme);
  drawIdentityGlass(ctx, theme);

  await drawAvatar(ctx, loadImage, data, theme);
  drawIdentity(ctx, data, theme, options);
  drawStats(ctx, data, theme);
  drawPlanet(ctx, data, theme);
  drawCardBorder(ctx, CARD.width, CARD.height, theme);

  ctx.restore();
  return canvas.toBuffer('image/png');
}

module.exports = {
  formatDuration,
  generateCard,
  CARD,
};
