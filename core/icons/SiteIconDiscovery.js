const ICON_REL_PRIORITY = Object.freeze({
  'apple-touch-icon': 500,
  'apple-touch-icon-precomposed': 490,
  icon: 400,
  'shortcut icon': 390
});

// 单个网站图标的字节上限；超出时换下一个候选，避免把大图写进缓存。
export const SITE_ICON_MAX_BYTES = 256 * 1024;

const CONTENT_TYPE_BY_EXTENSION = Object.freeze({
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  png: 'image/png',
  apng: 'image/apng',
  gif: 'image/gif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp'
});

function isHttpUrl(value, baseUrl) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function parseSize(value) {
  const sizes = String(value || '').match(/(\d+)x(\d+)/i);
  return sizes ? Number(sizes[1]) * Number(sizes[2]) : 0;
}

function attributesFromTag(tag) {
  const attributes = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attributes;
}

/** Extracts only page-declared icon references; no host or URL is used for matching. */
export function extractSiteIconCandidates(html, pageUrl) {
  const candidates = [];
  const manifestUrls = [];
  for (const match of String(html || '').matchAll(/<link\b[^>]*>/gi)) {
    const attributes = attributesFromTag(match[0]);
    const href = isHttpUrl(attributes.href, pageUrl);
    if (!href) continue;
    const rel = String(attributes.rel || '').toLowerCase().trim().replace(/\s+/g, ' ');
    if (rel === 'manifest') {
      manifestUrls.push(href);
      continue;
    }
    const priority = ICON_REL_PRIORITY[rel] || (rel.split(' ').includes('icon') ? 380 : 0);
    if (!priority) continue;
    candidates.push({
      url: href,
      source: `link:${rel}`,
      priority: priority + Math.min(parseSize(attributes.sizes), 100000) / 100000
    });
  }

  candidates.sort((a, b) => b.priority - a.priority);
  return { candidates, manifestUrls };
}

export function extractManifestIconCandidates(manifest, manifestUrl) {
  if (!manifest || !Array.isArray(manifest.icons)) return [];
  return manifest.icons
    .map(icon => {
      const url = isHttpUrl(icon?.src, manifestUrl);
      if (!url) return null;
      return {
        url,
        source: 'manifest',
        priority: 450 + Math.min(parseSize(icon.sizes), 100000) / 100000
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.priority - a.priority);
}

export function fallbackFaviconCandidate(pageUrl) {
  const url = isHttpUrl('/favicon.ico', pageUrl);
  return url ? { url, source: 'favicon.ico', priority: 1 } : null;
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  return candidates.filter(candidate => {
    if (!candidate?.url || seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  });
}

async function readResource(url, format, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'follow',
      signal: controller.signal
    });
    if (!response?.ok) return null;
    const finalUrl = isHttpUrl(response.url || url);
    if (!finalUrl) return null;
    return { url: finalUrl, body: await response[format]() };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Background-only discovery: never attach remote documents to the new-tab page.
 * `reachable` reports whether the page document itself could be read, so the caller
 * can tell a transient network failure apart from a site without usable icons.
 */
export async function discoverSiteIcons(pageUrl, options = {}) {
  if (!isHttpUrl(pageUrl)) return { candidates: [], reachable: false };
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 8000;
  if (!fetchImpl) throw new Error('Website icon fetching is unavailable');

  let page = null;
  try {
    page = await readResource(pageUrl, 'text', fetchImpl, timeoutMs);
  } catch {
    // Network, permission, redirect and timeout failures fall through to the fallback.
    page = null;
  }

  // 网页读不到时仍尝试同源 /favicon.ico：站点正文被拦截并不代表图标也不可用。
  if (!page) {
    const fallback = fallbackFaviconCandidate(pageUrl);
    return { candidates: fallback ? [fallback] : [], reachable: false };
  }

  try {
    const { candidates, manifestUrls } = extractSiteIconCandidates(page.body, page.url);
    const manifestCandidates = [];

    for (const manifestUrl of manifestUrls.slice(0, 1)) {
      try {
        const manifest = await readResource(manifestUrl, 'json', fetchImpl, timeoutMs);
        if (!manifest) continue;
        manifestCandidates.push(...extractManifestIconCandidates(
          manifest.body,
          manifest.url
        ));
      } catch {
        // A malformed manifest must not prevent normal favicon discovery.
      }
    }

    const fallback = fallbackFaviconCandidate(page.url);
    return {
      candidates: uniqueCandidates([...candidates, ...manifestCandidates, ...(fallback ? [fallback] : [])])
        .sort((a, b) => b.priority - a.priority),
      reachable: true
    };
  } catch {
    // Parsing failures behave like an unreachable page: retried later, never cached forever.
    return { candidates: [], reachable: false };
  }
}

function iconContentType(response, iconUrl) {
  const header = String(response?.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase();
  if (header.startsWith('image/')) return header;
  try {
    const extension = new URL(iconUrl).pathname.split('.').pop()?.toLowerCase();
    if (CONTENT_TYPE_BY_EXTENSION[extension]) return CONTENT_TYPE_BY_EXTENSION[extension];
  } catch {}
  return 'image/png';
}

function toBase64(bytes) {
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

/**
 * Background-only download. Returning a data URL keeps the icon bytes on the device,
 * so cards never re-request a third-party favicon on every new tab.
 */
export async function fetchSiteIconData(iconUrl, options = {}) {
  if (!isHttpUrl(iconUrl)) throw new Error('Invalid website icon URL');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxBytes = options.maxBytes ?? SITE_ICON_MAX_BYTES;
  if (!fetchImpl) throw new Error('Website icon fetching is unavailable');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(iconUrl, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'follow',
      signal: controller.signal
    });
    if (!response?.ok) throw new Error('Website icon request failed');
    // 先看声明长度，超大图标不必下载到内存。
    const declaredBytes = Number(response?.headers?.get?.('content-length'));
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      throw new Error('Website icon exceeds the cache size limit');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) throw new Error('Website icon response was empty');
    if (bytes.length > maxBytes) throw new Error('Website icon exceeds the cache size limit');
    const contentType = iconContentType(response, iconUrl);
    return {
      dataUrl: `data:${contentType};base64,${toBase64(bytes)}`,
      byteLength: bytes.length,
      contentType
    };
  } finally {
    clearTimeout(timer);
  }
}
