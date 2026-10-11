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

/**
 * Resolves a website icon into locally cached bytes: the background discovers
 * candidates and then downloads the bytes of each one, so the card never reloads a
 * third-party favicon. Transport failures reject (never cached); everything else
 * reports a failure reason that BookmarkStore turns into a timed retry.
 */
export async function resolveSiteIcon(pageUrl, options = {}) {
  if (!isHttpUrl(pageUrl)) return { model: null, failure: 'unreachable' };
  const runtime = options.runtime || globalThis.chrome?.runtime;
  const validateImage = options.validateImage || preloadImage;
  if (!runtime?.sendMessage) throw new Error('Website icon background service is unavailable');

  // Transport failures must reject so BookmarkStore never permanently caches them.
  const response = await runtime.sendMessage({ type: 'site-icons:discover', url: pageUrl });
  if (!response?.ok || !Array.isArray(response.candidates)) {
    throw new Error(response?.error || 'Invalid website icon background response');
  }

  let downloaded = 0;
  let failedDownloads = 0;
  for (const candidate of response.candidates) {
    if (!isHttpUrl(candidate?.url)) continue;
    const icon = await runtime.sendMessage({ type: 'site-icons:fetch', url: candidate.url });
    if (!icon?.ok || !icon.dataUrl) {
      failedDownloads += 1;
      continue;
    }
    downloaded += 1;
    if (!await validateImage(icon.dataUrl)) continue;
    return {
      model: {
        type: 'image',
        value: icon.dataUrl,
        byteLength: icon.byteLength,
        source: 'site',
        sourceLabel: '网站图标',
        matchReason: candidate.source
      },
      failure: null
    };
  }

  // 只有「网页读到了、每个候选都拿到了字节、但都不可解码」才算站点图标本身不可用，
  // 退避更长；只要有一次下载失败（网络/超时）就按网络问题处理，短时间内自动重试。
  const unusable = response.reachable === true && downloaded > 0 && failedDownloads === 0;
  return { model: null, failure: unusable ? 'unusable' : 'unreachable' };
}
