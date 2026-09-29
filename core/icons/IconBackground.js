import { isValidHexColor, normalizeIconScale } from './IconUploadProcessor.js';

const RAW_BACKGROUND = Object.freeze({ mode: 'raw' });

function normalizeColor(value) {
  return isValidHexColor(value) ? String(value).toLowerCase() : null;
}

function withScale(background, value) {
  const scale = normalizeIconScale(value);
  return scale === 1 ? background : { ...background, scale };
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
    return color ? withScale({ mode, color }, background.scale) : RAW_BACKGROUND;
  }
  if (mode === 'auto') {
    const result = normalizeAutoBackgroundResult(background.result);
    const sourceValue = typeof background.sourceValue === 'string' ? background.sourceValue : undefined;
    return result ? withScale({ mode, result, ...(sourceValue ? { sourceValue } : {}) }, background.scale) : withScale({ mode }, background.scale);
  }
  return withScale(RAW_BACKGROUND, background?.scale);
}

export function getIconScale(background) {
  return normalizeIconScale(background?.scale);
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

export function cloneIconBackground(background) {
  return JSON.parse(JSON.stringify(normalizeIconBackground(background)));
}
