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

function isHttpUrl(value) {
  try {
    return ['https:', 'http:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export async function resolveSiteIcon(pageUrl, options = {}) {
  if (!isHttpUrl(pageUrl)) return null;
  const runtime = options.runtime || globalThis.chrome?.runtime;
  const validateImage = options.validateImage || preloadImage;
  if (!runtime?.sendMessage) throw new Error('Website icon background service is unavailable');

  // Transport failures must reject so BookmarkStore never permanently caches them.
  const response = await runtime.sendMessage({ type: 'site-icons:discover', url: pageUrl });
  if (!response?.ok || !Array.isArray(response.candidates)) {
    throw new Error(response?.error || 'Invalid website icon background response');
  }
  for (const candidate of response.candidates) {
    if (!isHttpUrl(candidate?.url)) continue;
    if (await validateImage(candidate.url)) {
      return { type: 'image', value: candidate.url, source: 'site', sourceLabel: '网站图标', matchReason: candidate.source };
    }
  }
  return null;
}
