import { sanitizeSvg } from './IconSanitizer.js';
import { validateBitmapDimensions } from './BitmapIconProcessor.js';

export const MAX_STATIC_ICON_UPLOAD_BYTES = 1024 * 1024;
export const MAX_ANIMATED_ICON_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MIN_ICON_SCALE = 0.4;
export const MAX_ICON_SCALE = 4;
export const ACCEPTED_ICON_TYPES = Object.freeze([
  'image/svg+xml',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
]);

export function isValidHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '').trim());
}

export function normalizeIconScale(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.round(Math.min(MAX_ICON_SCALE, Math.max(MIN_ICON_SCALE, number)) * 20) / 20;
}

function containsAscii(bytes, token) {
  const values = [...token].map(char => char.charCodeAt(0));
  for (let index = 0; index <= bytes.length - values.length; index += 1) {
    if (values.every((value, offset) => bytes[index + offset] === value)) return true;
  }
  return false;
}

export async function isAnimatedBitmapFile(file) {
  if (file.type === 'image/gif') return true;
  if (!['image/png', 'image/webp'].includes(file.type) || typeof file.arrayBuffer !== 'function') return false;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return file.type === 'image/png'
      ? containsAscii(bytes, 'acTL')
      : containsAscii(bytes, 'ANIM') || containsAscii(bytes, 'ANMF');
  } catch {
    return false;
  }
}

function hasSvgAnimation(svg) {
  return /<(?:animate|animateMotion|animateTransform|set)\b|@keyframes\b/i.test(svg);
}

export function createCustomIconRecord({ kind, data, background = null, backgroundMode = 'raw', backgroundColor = '#ffffff', scale = 1 }) {
  const requestedBackground = background || (backgroundMode === 'solid'
    ? { mode: 'solid', color: backgroundColor }
    : { mode: 'raw' });
  const color = String(requestedBackground?.color || '').trim().toLowerCase();
  const normalizedBackground = requestedBackground?.mode === 'solid' && isValidHexColor(color)
    ? { mode: 'solid', color }
    : requestedBackground?.mode === 'auto'
      ? requestedBackground
      : { mode: 'raw' };
  return {
    version: 4,
    kind,
    data,
    background: normalizedBackground,
    scale: normalizeIconScale(scale)
  };
}

export function validateIconUpload(file) {
  if (!file) return { ok: false, reason: '请选择图标文件' };
  if (!ACCEPTED_ICON_TYPES.includes(file.type)) return { ok: false, reason: '仅支持 SVG、PNG/APNG、JPG、WebP 和 GIF 图标' };
  if (file.size > MAX_ANIMATED_ICON_UPLOAD_BYTES) return { ok: false, reason: '动态图文件不能超过 10MB' };
  if (file.size > MAX_STATIC_ICON_UPLOAD_BYTES && ['image/jpeg'].includes(file.type)) return { ok: false, reason: '静态图标文件不能超过 1MB' };
  if (file.size < 1) return { ok: false, reason: '图标文件不能为空' };
  return { ok: true };
}

export async function readIconUpload(file, options = {}) {
  const validation = validateIconUpload(file);
  if (!validation.ok) return validation;

  if (file.type === 'image/svg+xml') {
    const clean = sanitizeSvg(await file.text());
    if (file.size > MAX_STATIC_ICON_UPLOAD_BYTES && !hasSvgAnimation(clean)) {
      return { ok: false, reason: '静态 SVG 不能超过 1MB；SVG 动画可到 10MB' };
    }
    return clean ? { ok: true, kind: 'svg', data: clean } : { ok: false, reason: 'SVG 无效或包含不安全内容' };
  }

  if (file.size > MAX_STATIC_ICON_UPLOAD_BYTES && !(await isAnimatedBitmapFile(file))) {
    return { ok: false, reason: '静态图片不能超过 1MB；GIF、APNG 和动态 WebP 可到 10MB' };
  }

  const readDataUrl = options.readDataUrl || (input => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取图标失败'));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(input);
  }));
  const loadImage = options.loadImage || (src => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片无法解码'));
    image.src = src;
  }));

  try {
    const data = await readDataUrl(file);
    const image = await loadImage(data);
    const dimensions = validateBitmapDimensions(image.naturalWidth, image.naturalHeight);
    return dimensions.ok ? { ok: true, kind: 'image', data } : dimensions;
  } catch {
    return { ok: false, reason: '图片无法解码' };
  }
}
