import { isValidHexColor } from './IconUploadProcessor.js';

const RAW_BACKGROUND = Object.freeze({ mode: 'raw' });

function normalizeColor(value) {
  return isValidHexColor(value) ? String(value).toLowerCase() : null;
}

function normalizeGradient(result) {
  const colors = Array.isArray(result?.colors)
    ? result.colors.map(normalizeColor).filter(Boolean).slice(0, 3)
    : [];
  return colors.length >= 2
    ? { type: 'gradient', colors, angle: Number.isFinite(result?.angle) ? result.angle : 135 }
    : null;
}

export function normalizeIconBackground(background) {
  const mode = background?.mode;
  if (mode === 'solid') {
    const color = normalizeColor(background.color);
    return color ? { mode, color } : RAW_BACKGROUND;
  }
  if (mode === 'auto') {
    const result = normalizeAutoBackgroundResult(background.result);
    const sourceValue = typeof background.sourceValue === 'string' ? background.sourceValue : undefined;
    return result ? { mode, result, ...(sourceValue ? { sourceValue } : {}) } : { mode };
  }
  return RAW_BACKGROUND;
}

export function normalizeAutoBackgroundResult(result) {
  const color = normalizeColor(result?.color);
  if (result?.type === 'solid' && color) return { type: 'solid', color };
  return normalizeGradient(result);
}

export function resolveBackgroundResult(background) {
  const normalized = normalizeIconBackground(background);
  if (normalized.mode === 'solid') return { type: 'solid', color: normalized.color };
  if (normalized.mode === 'auto') return normalized.result || null;
  return null;
}

export function backgroundCssValue(background) {
  const result = resolveBackgroundResult(background);
  if (!result) return '';
  if (result.type === 'solid') return result.color;
  return `linear-gradient(${result.angle}deg, ${result.colors.join(', ')})`;
}

function luminance(hex) {
  const channels = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(foreground, background) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function mixHex(left, right, amount) {
  const channels = [1, 3, 5].map(index => Math.round(
    Number.parseInt(left.slice(index, index + 2), 16) * (1 - amount) + Number.parseInt(right.slice(index, index + 2), 16) * amount
  ));
  return `#${channels.map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

/** Returns the black/white colour with the safest contrast across a background. */
export function iconTextColor(background) {
  const result = resolveBackgroundResult(background);
  if (!result) return '';
  const samples = result.type === 'solid' ? [result.color] : result.colors.flatMap((color, index, colors) => {
    const next = colors[index + 1];
    return next ? [color, 0.25, 0.5, 0.75].map(amount => amount ? mixHex(color, next, amount) : color) : [color];
  });
  let black = Infinity;
  let white = Infinity;
  samples.forEach(color => {
    const blackContrast = contrastRatio('#111111', color);
    const whiteContrast = contrastRatio('#ffffff', color);
    if (Number.isFinite(blackContrast)) black = Math.min(black, blackContrast);
    if (Number.isFinite(whiteContrast)) white = Math.min(white, whiteContrast);
  });
  return white > black ? '#ffffff' : '#111111';
}

export function cloneIconBackground(background) {
  return JSON.parse(JSON.stringify(normalizeIconBackground(background)));
}
