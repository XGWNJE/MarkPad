import { normalizeAutoBackgroundResult } from './IconBackground.js';

const SAMPLE_SIZE = 96;

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图标无法解码'));
    image.src = source;
  });
}

function toHex(r, g, b) {
  return `#${[r, g, b].map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

function quantize(value) {
  return Math.min(255, Math.round(value / 32) * 32);
}

function edgePixels(imageData, width, height) {
  const pixels = [];
  const data = imageData.data;
  const alphaAt = (x, y) => data[(y * width + x) * 4 + 3];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (data[index + 3] < 20) continue;
      const isOuter = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      const hasTransparentNeighbour = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => {
        const nextX = x + dx;
        const nextY = y + dy;
        return nextX < 0 || nextY < 0 || nextX >= width || nextY >= height || alphaAt(nextX, nextY) < 20;
      });
      if (isOuter || hasTransparentNeighbour) pixels.push([data[index], data[index + 1], data[index + 2]]);
    }
  }
  return pixels;
}

export function analyzeIconEdgePixels(pixels) {
  if (!pixels.length) return null;
  const buckets = new Map();
  pixels.forEach(([r, g, b]) => {
    const color = toHex(quantize(r), quantize(g), quantize(b));
    buckets.set(color, (buckets.get(color) || 0) + 1);
  });
  const ranked = [...buckets.entries()].sort((a, b) => b[1] - a[1]);
  const total = pixels.length;
  const colors = ranked.slice(0, 3).map(([color]) => color);
  if (!colors.length) return null;
  if (ranked[0][1] / total >= 0.68 || colors.length === 1) return { type: 'solid', color: colors[0] };
  return { type: 'gradient', colors, angle: 135 };
}

async function sourceToObjectUrl({ kind, value }) {
  if (kind === 'svg') {
    return { url: URL.createObjectURL(new Blob([value], { type: 'image/svg+xml' })), revoke: true };
  }
  if (String(value).startsWith('data:')) return { url: value, revoke: false };
  const response = await fetch(value, { credentials: 'omit' });
  if (!response.ok) throw new Error('网站图标无法读取');
  return { url: URL.createObjectURL(await response.blob()), revoke: true };
}

/** Samples only the first decoded frame; source bytes are never altered or re-encoded. */
export async function analyzeIconBackground({ kind, value }) {
  if (!value || !['svg', 'image'].includes(kind)) return { ok: false, reason: '图标格式无法分析' };
  let objectUrl;
  try {
    objectUrl = await sourceToObjectUrl({ kind, value });
    const image = await loadImage(objectUrl.url);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error('图标无法解码');
    const scale = Math.min(SAMPLE_SIZE / width, SAMPLE_SIZE / height, 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('浏览器不支持图标颜色分析');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = normalizeAutoBackgroundResult(analyzeIconEdgePixels(edgePixels(context.getImageData(0, 0, canvas.width, canvas.height), canvas.width, canvas.height)));
    return result ? { ok: true, result } : { ok: false, reason: '未能识别图标边缘颜色' };
  } catch (error) {
    return { ok: false, reason: error?.message || '图标背景分析失败' };
  } finally {
    if (objectUrl?.revoke) URL.revokeObjectURL(objectUrl.url);
  }
}
