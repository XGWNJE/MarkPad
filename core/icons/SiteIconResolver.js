const ICON_REL_PRIORITY = Object.freeze({
  'apple-touch-icon': 500,
  'apple-touch-icon-precomposed': 490,
  icon: 400,
  'shortcut icon': 390
});

function isHttpUrl(value, baseUrl) {
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

export function preloadImage(url, ImageConstructor = globalThis.Image) {
  if (!ImageConstructor) return Promise.resolve(false);
  return new Promise(resolve => {
    const image = new ImageConstructor();
    image.referrerPolicy = 'no-referrer';
    const timer = setTimeout(() => resolve(false), 8000);
    image.onload = () => {
      clearTimeout(timer);
      resolve(image.naturalWidth > 1 && image.naturalHeight > 1);
    };
    image.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    image.src = url;
  });
}

export async function resolveSiteIcon(pageUrl, options = {}) {
  if (!isHttpUrl(pageUrl)) return null;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const validateImage = options.validateImage || preloadImage;
  if (!fetchImpl) return null;

  try {
    const pageResponse = await fetchImpl(pageUrl, {
      credentials: 'omit',
      redirect: 'follow',
      signal: options.signal
    });
    if (!pageResponse?.ok) return null;
    const pageUrlAfterRedirect = isHttpUrl(pageResponse.url || pageUrl) || pageUrl;
    const { candidates, manifestUrls } = extractSiteIconCandidates(await pageResponse.text(), pageUrlAfterRedirect);
    const manifestCandidates = [];

    for (const manifestUrl of manifestUrls.slice(0, 1)) {
      try {
        const manifestResponse = await fetchImpl(manifestUrl, { credentials: 'omit', redirect: 'follow', signal: options.signal });
        if (!manifestResponse?.ok) continue;
        manifestCandidates.push(...extractManifestIconCandidates(
          await manifestResponse.json(),
          isHttpUrl(manifestResponse.url || manifestUrl) || manifestUrl
        ));
      } catch {
        // A malformed manifest must not prevent normal favicon discovery.
      }
    }

    const fallback = fallbackFaviconCandidate(pageUrlAfterRedirect);
    const ordered = uniqueCandidates([...candidates, ...manifestCandidates, ...(fallback ? [fallback] : [])])
      .sort((a, b) => b.priority - a.priority);
    for (const candidate of ordered) {
      if (await validateImage(candidate.url)) {
        return { type: 'image', value: candidate.url, source: 'site', sourceLabel: '网站图标', matchReason: candidate.source };
      }
    }
  } catch {
    // Network and permission failures resolve to the documented no-icon state.
  }
  return null;
}
