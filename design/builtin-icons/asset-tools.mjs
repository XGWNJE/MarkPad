import fs from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { sanitizeSvg } from '../../core/icons/IconSanitizer.js';

const require = createRequire(import.meta.url);
let imageProcessor;
try { imageProcessor = require(process.env.MARKPAD_SHARP_PATH || 'sharp'); }
catch { imageProcessor = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')); }
export const sharp = imageProcessor;
export const root = path.dirname(fileURLToPath(import.meta.url));
export const project = path.resolve(root, '../..');
export const flatDir = path.join(project, 'assets/bookmark-icons/flat');
export const clayDir = path.join(project, 'assets/bookmark-icons/clay');
export const referenceDir = path.join(root, 'references');

export async function prepareDirectories() {
  for (const dir of [flatDir, clayDir, referenceDir, path.join(root, 'sources'), path.join(root, 'sheets'), path.join(root, 'receipts')]) await fs.mkdir(dir, { recursive: true });
}

export async function buildFlat(id, svg, { size = 180 } = {}) {
  await prepareDirectories();
  const safe = sanitizeSvg(svg);
  if (!safe) throw new Error(`Unsafe or unsupported source: ${id}`);
  const attrs = safe.match(/<svg\b([^>]*)>/i)?.[1] || '';
  const box = attrs.match(/viewBox="([^"]+)"/i)?.[1]?.split(/[ ,]+/).map(Number) || [0, 0, 24, 24];
  const [x, y, w, h] = box;
  const scale = size / Math.max(w, h);
  const inherited = attrs.match(/\b(?:fill|fill-rule|stroke)="[^"]+"/g)?.join(' ') || 'fill="#262825"';
  const body = safe.replace(/^[\s\S]*?<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/currentColor/g, '#262825');
  const group = `<g transform="translate(${(256 - w * scale) / 2 - x * scale} ${(256 - h * scale) / 2 - y * scale}) scale(${scale})" ${inherited.replace(/currentColor/g, '#262825')}>${body}</g>`;
  const canvas = content => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none">${content}</svg>`;
  const final = sanitizeSvg(canvas(`<rect width="256" height="256" fill="#f5f3ed"/>${group}`));
  await fs.writeFile(path.join(flatDir, `${id}.svg`), `${final}\n`);
  await sharp(Buffer.from(canvas(group))).resize(384, 384).png().toFile(path.join(referenceDir, `${id}.png`));
}

// For a site without a reusable clear mark: an honest, editable wordmark initial.
export function initialSvg(initial, color = '#456b86') {
  // Path glyphs keep exports font independent and compatible with the SVG sanitizer.
  const glyphs = {
    A:'M8 52 26 8h12l18 44H44l-3-9H23l-3 9ZM27 32h10l-5-14Z',
    B:'M12 8h22c24 0 25 21 11 24 18 3 15 24-8 24H12Zm12 10v10h10c10 0 10-10 0-10Zm0 20v8h12c10 0 10-8 0-8Z',
    C:'M54 16 45 24C30 8 9 32 26 44c6 5 14 2 19-3l9 9C25 76-4 35 14 15 25 2 44 4 54 16Z',
    G:'M55 17 46 25C26 8 10 34 27 45c7 4 14 1 17-4h-13V30h26v10C50 66 14 63 6 41-3 16 32-6 55 17Z',
    H:'M10 8h12v17h20V8h12v48H42V37H22v19H10Z',
    I:'M14 8h36v11H38v26h12v11H14V45h12V19H14Z',
    J:'M19 8h36v32c0 25-42 25-45 1l12-3c2 12 21 12 21 1V19H19Z',
    K:'M10 8h12v18L41 8h16L33 31l24 25H41L22 36v20H10Z',
    L:'M12 8h12v36h30v12H12Z',
    M:'M6 56V8h14l12 23L44 8h14v48H46V28L32 51 18 28v28Z',
    N:'M8 56V8h13l22 29V8h13v48H43L21 27v29Z',
    P:'M12 56V8h23c30 0 30 33 0 33H24v15Zm12-37v11h11c12 0 12-11 0-11Z',
    R:'M10 56V8h25c28 0 29 27 9 32l15 16H43L24 36v20Zm14-37v11h11c12 0 12-11 0-11Z',
    S:'M52 13 46 24c-15-11-28-2-20 3l15 4c27 9 8 39-30 21l6-11c16 11 32 3 21-2l-15-4C-2 26 18-3 52 13Z',
    T:'M5 8h54v12H38v36H26V20H5Z',
    V:'M4 8h14l14 33L46 8h14L39 56H25Z',
    W:'M3 8h13l7 29 9-29 9 29 7-29h13L49 56H36l-4-16-4 16H15Z',
    X:'M6 8h15l11 15L43 8h15L40 32l18 24H43L32 41 21 56H6l18-24Z'
  };
  const key = String(initial).toUpperCase()[0];
  const d = glyphs[key] || glyphs.I;
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="62" height="62" rx="16" fill="${color}"/><path d="${d}" transform="translate(10 10) scale(.6875)" fill="#fff" fill-rule="evenodd"/></svg>`;
}

export async function makeReferenceSheet(ids, sheetId) {
  const cell = 384;
  const columns = 3;
  const rows = Math.ceil(ids.length / columns);
  const composites = await Promise.all(ids.map(async (id, index) => ({ input: await fs.readFile(path.join(referenceDir, `${id}.png`)), left: index % columns * cell, top: Math.floor(index / columns) * cell })));
  const target = path.join(root, 'sheets', `${sheetId}-reference.png`);
  await sharp({ create: { width: columns * cell, height: rows * cell, channels: 4, background: '#ffffff00' } }).composite(composites).png().toFile(target);
  return target;
}

export async function exportCenteredIcon(input, target) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] < 64) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right < left) throw new Error('Icon has no visible subject');
  // Crop and place only. Retain native colors/alpha; do not matte or repaint edges.
  const padding = Math.max(2, Math.round(Math.max(info.width, info.height) * .015));
  left = Math.max(0, left - padding); top = Math.max(0, top - padding);
  right = Math.min(info.width - 1, right + padding); bottom = Math.min(info.height - 1, bottom + padding);
  const bounds = { left, top, width: right - left + 1, height: bottom - top + 1 };
  const { data: resized, info: rendered } = await sharp(input).extract(bounds).resize(196, 196, { fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
  const position = { left: Math.round((256 - rendered.width) / 2), top: Math.round((256 - rendered.height) / 2) };
  await sharp({ create: { width: 256, height: 256, channels: 4, background: '#00000000' } }).composite([{ input: resized, ...position }]).png().toFile(target);
  return { bounds, rendered: { width: rendered.width, height: rendered.height }, position };
}

// The user explicitly requested contact-sheet generation followed by cropping.
export async function cropSheet(sourcePath, ids, sheetId) {
  await prepareDirectories();
  const meta = await sharp(sourcePath).metadata();
  if (!meta.hasAlpha) throw new Error(`Sheet needs transparency: ${sheetId}`);
  const rows = Math.ceil(ids.length / 3);
  const results = [];
  for (let i = 0; i < ids.length; i++) {
    const left = Math.round(i % 3 * meta.width / 3);
    const top = Math.round(Math.floor(i / 3) * meta.height / rows);
    const right = Math.round((i % 3 + 1) * meta.width / 3);
    const bottom = Math.round((Math.floor(i / 3) + 1) * meta.height / rows);
    const target = path.join(clayDir, `${ids[i]}.png`);
    const cell = await sharp(sourcePath).extract({ left, top, width: right - left, height: bottom - top }).png().toBuffer();
    const placement = await exportCenteredIcon(cell, target);
    results.push({ id: ids[i], target, crop: { left, top, width: right - left, height: bottom - top }, placement });
  }
  return results;
}
