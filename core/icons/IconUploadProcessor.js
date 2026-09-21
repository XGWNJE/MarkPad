import { sanitizeSvg } from './IconSanitizer.js';
import { validateBitmapDimensions } from './BitmapIconProcessor.js';

export const MAX_ICON_UPLOAD_BYTES = 1024 * 1024;
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

export function createCustomIconRecord({ kind, data, background = null, backgroundMode = 'raw', backgroundColor = '#ffffff' }) {
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
    version: 3,
    kind,
    data,
    background: normalizedBackground
  };
}

export function validateIconUpload(file) {
  if (!file) return { ok: false, reason: '请选择图标文件' };
  if (!ACCEPTED_ICON_TYPES.includes(file.type)) return { ok: false, reason: '仅支持 SVG、PNG/APNG、JPG、WebP 和 GIF 图标' };
  if (file.size > MAX_ICON_UPLOAD_BYTES) return { ok: false, reason: '图标文件不能超过 1MB' };
  if (file.size < 1) return { ok: false, reason: '图标文件不能为空' };
  return { ok: true };
}

export async function readIconUpload(file, options = {}) {
  const validation = validateIconUpload(file);
  if (!validation.ok) return validation;

  if (file.type === 'image/svg+xml') {
    const clean = sanitizeSvg(await file.text());
    return clean ? { ok: true, kind: 'svg', data: clean } : { ok: false, reason: 'SVG 无效或包含不安全内容' };
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
