import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractManifestIconCandidates,
  extractSiteIconCandidates,
  fallbackFaviconCandidate,
  discoverSiteIcons,
  fetchSiteIconData,
  SITE_ICON_MAX_BYTES
} from '../core/icons/SiteIconDiscovery.js';
import { resolveSiteIcon } from '../core/icons/SiteIconResolver.js';

const ICON_BYTES = Uint8Array.from([1, 2, 3, 4]);
const ICON_DATA_URL = `data:image/png;base64,${Buffer.from(ICON_BYTES).toString('base64')}`;

function iconResponse(bytes = ICON_BYTES, contentType = 'image/png') {
  return {
    ok: true,
    url: 'https://example.com/icon.png',
    headers: { get: name => (name === 'content-type' ? contentType : null) },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  };
}

/** Background stand-in: serves candidate discovery and icon bytes over the message channel. */
function backgroundFor(candidates, icons = {}) {
  const messages = [];
  return {
    messages,
    runtime: {
      sendMessage: async message => {
        messages.push(message);
        if (message.type === 'site-icons:discover') return { ok: true, candidates, reachable: true };
        const icon = icons[message.url];
        return icon ? { ok: true, ...icon } : { ok: false, error: 'Website icon download failed' };
      }
    }
  };
}

test('page icon declarations resolve relative URLs and reject unsafe protocols', () => {
  const result = extractSiteIconCandidates(`
    <link rel="icon" href="/assets/icon.svg" sizes="64x64">
    <link rel="apple-touch-icon" href="https://cdn.example/icon.png" sizes="180x180">
    <link rel="icon" href="javascript:alert(1)">
    <link rel="manifest" href="/site.webmanifest">
  `, 'https://example.com/app/page');

  assert.deepEqual(result.candidates.map(item => item.url), [
    'https://cdn.example/icon.png',
    'https://example.com/assets/icon.svg'
  ]);
  assert.deepEqual(result.manifestUrls, ['https://example.com/site.webmanifest']);
});

test('manifest candidates prefer the largest declared icon', () => {
  const candidates = extractManifestIconCandidates({
    icons: [
      { src: 'small.png', sizes: '48x48' },
      { src: '/large.png', sizes: '512x512' },
      { src: 'data:image/png;base64,nope', sizes: '999x999' }
    ]
  }, 'https://example.com/site.webmanifest');

  assert.deepEqual(candidates.map(item => item.url), [
    'https://example.com/large.png',
    'https://example.com/small.png'
  ]);
});

test('same-origin favicon is the last website-resource fallback', () => {
  assert.deepEqual(fallbackFaviconCandidate('https://example.com/path'), {
    url: 'https://example.com/favicon.ico', source: 'favicon.ico', priority: 1
  });
});

test('resolver downloads icon bytes and returns a locally cached data URL', async () => {
  const { runtime, messages } = backgroundFor(
    [{ url: 'https://example.com/animated.gif', source: 'link:icon' }],
    { 'https://example.com/animated.gif': { dataUrl: ICON_DATA_URL, byteLength: ICON_BYTES.length, contentType: 'image/png' } }
  );
  const { model, failure } = await resolveSiteIcon('https://example.com/page', { runtime, validateImage: async () => true });

  assert.equal(failure, null);
  assert.equal(model.value, ICON_DATA_URL);
  assert.equal(model.byteLength, ICON_BYTES.length);
  assert.equal(model.source, 'site');
  assert.equal(model.matchReason, 'link:icon');
  assert.deepEqual(messages, [
    { type: 'site-icons:discover', url: 'https://example.com/page' },
    { type: 'site-icons:fetch', url: 'https://example.com/animated.gif' }
  ]);
});

test('discovery follows redirect bases, omits credentials, and ignores unrelated preloads and scripts', async () => {
  const calls = [];
  const { candidates, reachable } = await discoverSiteIcons('https://example.com/start', {
    fetchImpl: async (url, options) => {
      calls.push(url);
      assert.equal(options.credentials, 'omit');
      assert.equal(options.referrerPolicy, 'no-referrer');
      assert.ok(options.signal instanceof AbortSignal);
      if (calls.length === 1) return {
        ok: true, url: 'https://example.com/app/',
        text: async () => '<script src="/remote.js"></script><link rel="preload" href="/style.css"><link rel="icon"><link rel="icon" href="icon.png"><link rel="manifest" href="manifest.json">'
      };
      return { ok: true, url: 'https://cdn.example/data/manifest.json', json: async () => ({ icons: [{ src: 'large.png', sizes: '512x512' }] }) };
    }
  });
  assert.deepEqual(calls, ['https://example.com/start', 'https://example.com/app/manifest.json']);
  assert.equal(reachable, true);
  assert.deepEqual(candidates.map(item => item.url), ['https://cdn.example/data/large.png', 'https://example.com/app/icon.png', 'https://example.com/favicon.ico']);
});

test('unreadable pages still offer the favicon fallback and report an unreachable page', async () => {
  for (const url of ['file:///private', 'javascript:alert(1)', 'not a url']) {
    const result = await discoverSiteIcons(url, { fetchImpl: () => assert.fail('Unexpected fetch') });
    assert.deepEqual(result, { candidates: [], reachable: false });
  }
  for (const fetchImpl of [
    async () => ({ ok: false }),
    async () => { throw new Error('Offline'); }
  ]) {
    const result = await discoverSiteIcons('https://example.com/page', { fetchImpl });
    assert.equal(result.reachable, false);
    assert.deepEqual(result.candidates.map(item => item.url), ['https://example.com/favicon.ico']);
  }
});

test('malformed manifests preserve page icons and hanging requests are aborted', async () => {
  const { candidates } = await discoverSiteIcons('https://example.com', {
    fetchImpl: async url => ({ ok: true, url, text: async () => '<link rel="icon" href="/icon.png"><link rel="manifest" href="/manifest.json">', json: async () => { throw new SyntaxError('Invalid JSON'); } })
  });
  assert.equal(candidates[0].url, 'https://example.com/icon.png');

  let aborted = false;
  const timedOut = await discoverSiteIcons('https://example.com', {
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('Aborted')); }))
  });
  assert.equal(aborted, true);
  assert.equal(timedOut.reachable, false);
  assert.deepEqual(timedOut.candidates.map(item => item.url), ['https://example.com/favicon.ico']);
});

test('background download converts bytes to a data URL and refuses unusable responses', async () => {
  const icon = await fetchSiteIconData('https://example.com/icon.png', { fetchImpl: async (url, options) => {
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    return { ...iconResponse(), url };
  } });
  assert.equal(icon.dataUrl, ICON_DATA_URL);
  assert.equal(icon.byteLength, ICON_BYTES.length);
  assert.equal(icon.contentType, 'image/png');

  const svg = await fetchSiteIconData('https://example.com/icon.svg', {
    fetchImpl: async () => iconResponse(Uint8Array.from([60, 115, 118, 103, 62]), 'application/octet-stream')
  });
  assert.equal(svg.contentType, 'image/svg+xml');

  await assert.rejects(fetchSiteIconData('file:///private', { fetchImpl: () => assert.fail('Unexpected fetch') }), /Invalid website icon URL/);
  await assert.rejects(fetchSiteIconData('https://example.com/icon.png', { fetchImpl: async () => ({ ok: false }) }), /request failed/);
  await assert.rejects(fetchSiteIconData('https://example.com/icon.png', { fetchImpl: async () => iconResponse(new Uint8Array(0)) }), /empty/);
  await assert.rejects(fetchSiteIconData('https://example.com/icon.png', {
    fetchImpl: async () => iconResponse(new Uint8Array(SITE_ICON_MAX_BYTES + 1))
  }), /size limit/);

  // 声明长度已经超限时不再下载正文。
  await assert.rejects(fetchSiteIconData('https://example.com/huge.png', {
    fetchImpl: async () => ({
      ok: true,
      url: 'https://example.com/huge.png',
      headers: { get: name => (name === 'content-length' ? String(SITE_ICON_MAX_BYTES + 1) : null) },
      arrayBuffer: () => assert.fail('Oversized icons must not be read into memory')
    })
  }), /size limit/);
});

test('client rejects transport failures instead of returning a cacheable no-icon result', async () => {
  await assert.rejects(resolveSiteIcon('https://example.com', { runtime: {} }), /unavailable/);
  await assert.rejects(resolveSiteIcon('https://example.com', { runtime: { sendMessage: async () => { throw new Error('Disconnected'); } } }), /Disconnected/);
  for (const response of [undefined, { ok: false, error: 'Background failed' }, { ok: true }]) {
    await assert.rejects(resolveSiteIcon('https://example.com', { runtime: { sendMessage: async () => response } }));
  }
  assert.deepEqual(
    await resolveSiteIcon('https://example.com', { runtime: { sendMessage: async () => ({ ok: true, candidates: [] }) } }),
    { model: null, failure: 'unreachable' }
  );
});

test('client skips unsafe URLs and reports why no icon could be used', async () => {
  const { runtime, messages } = backgroundFor([
    { url: 'javascript:alert(1)' },
    { url: 'https://example.com/broken.png' }
  ]);
  const unreachable = await resolveSiteIcon('https://example.com', { runtime, validateImage: async () => assert.fail('Unusable candidates are never validated') });
  assert.deepEqual(unreachable, { model: null, failure: 'unreachable' });
  assert.deepEqual(messages.filter(message => message.type === 'site-icons:fetch'), [
    { type: 'site-icons:fetch', url: 'https://example.com/broken.png' }
  ]);

  const checked = [];
  const broken = backgroundFor(
    [{ url: 'https://example.com/broken.png' }, { url: 'https://example.com/animated.svg', source: 'link:icon' }],
    {
      'https://example.com/broken.png': { dataUrl: 'data:image/png;base64,bm9wZQ==', byteLength: 4, contentType: 'image/png' },
      'https://example.com/animated.svg': { dataUrl: ICON_DATA_URL, byteLength: ICON_BYTES.length, contentType: 'image/svg+xml' }
    }
  );
  const { model, failure } = await resolveSiteIcon('https://example.com', {
    runtime: broken.runtime,
    validateImage: async value => { checked.push(value); return value === ICON_DATA_URL; }
  });
  assert.equal(failure, null);
  assert.deepEqual(checked, ['data:image/png;base64,bm9wZQ==', ICON_DATA_URL]);
  assert.equal(model.value, ICON_DATA_URL);
  assert.equal(model.matchReason, 'link:icon');

  const unusable = await resolveSiteIcon('https://example.com', {
    runtime: backgroundFor(
      [{ url: 'https://example.com/broken.png' }],
      { 'https://example.com/broken.png': { dataUrl: 'data:image/png;base64,bm9wZQ==', byteLength: 4, contentType: 'image/png' } }
    ).runtime,
    validateImage: async () => false
  });
  assert.deepEqual(unusable, { model: null, failure: 'unusable' });

  // 网页本身读不到时按网络问题处理，退避更短。
  const offline = await resolveSiteIcon('https://example.com', {
    runtime: {
      sendMessage: async message => message.type === 'site-icons:discover'
        ? { ok: true, candidates: [{ url: 'https://example.com/favicon.ico' }], reachable: false }
        : { ok: true, dataUrl: 'data:image/png;base64,bm9wZQ==', byteLength: 4, contentType: 'image/png' }
    },
    validateImage: async () => false
  });
  assert.deepEqual(offline, { model: null, failure: 'unreachable' });
});
