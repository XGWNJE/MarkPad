const ICON_REL_PRIORITY = Object.freeze({
  'apple-touch-icon': 500,
  'apple-touch-icon-precomposed': 490,
  icon: 400,
  'shortcut icon': 390
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

/** Background-only discovery: never attach remote documents to the new-tab page. */
export async function discoverSiteIcons(pageUrl, options = {}) {
  if (!isHttpUrl(pageUrl)) return [];
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 8000;
  if (!fetchImpl) throw new Error('Website icon fetching is unavailable');

  try {
    const page = await readResource(pageUrl, 'text', fetchImpl, timeoutMs);
    if (!page) return [];
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
    return uniqueCandidates([...candidates, ...manifestCandidates, ...(fallback ? [fallback] : [])])
      .sort((a, b) => b.priority - a.priority);
  } catch {
    // Network and permission failures resolve to the documented no-icon state.
  }
  return [];
}
