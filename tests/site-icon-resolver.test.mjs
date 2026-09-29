import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractManifestIconCandidates,
  extractSiteIconCandidates,
  fallbackFaviconCandidate,
  discoverSiteIcons
} from '../core/icons/SiteIconDiscovery.js';
import { resolveSiteIcon } from '../core/icons/SiteIconResolver.js';

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

test('resolver tries page-declared resources without rewriting the image bytes', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    return {
      ok: true,
      url,
      text: async () => '<link rel="icon" href="/animated.gif">',
      json: async () => ({})
    };
  };
  const model = await resolveSiteIcon('https://example.com/page', {
    runtime: { sendMessage: async message => ({ ok: true, candidates: await discoverSiteIcons(message.url, { fetchImpl }) }) },
    validateImage: async url => url === 'https://example.com/animated.gif'
  });

  assert.equal(model.value, 'https://example.com/animated.gif');
  assert.equal(model.source, 'site');
  assert.deepEqual(calls, ['https://example.com/page']);
});

test('discovery follows redirect bases, omits credentials, and ignores unrelated preloads and scripts', async () => {
  const calls = [];
  const candidates = await discoverSiteIcons('https://example.com/start', {
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
  assert.deepEqual(candidates.map(item => item.url), ['https://cdn.example/data/large.png', 'https://example.com/app/icon.png', 'https://example.com/favicon.ico']);
});

test('invalid URLs do not fetch and HTTP/network failures give a no-icon result', async () => {
  for (const url of ['file:///private', 'javascript:alert(1)', 'not a url']) {
    assert.deepEqual(await discoverSiteIcons(url, { fetchImpl: () => assert.fail('Unexpected fetch') }), []);
  }
  assert.deepEqual(await discoverSiteIcons('https://example.com', { fetchImpl: async () => ({ ok: false }) }), []);
  assert.deepEqual(await discoverSiteIcons('https://example.com', { fetchImpl: async () => { throw new Error('Offline'); } }), []);
});

test('malformed manifests preserve page icons and hanging requests are aborted', async () => {
  const candidates = await discoverSiteIcons('https://example.com', {
    fetchImpl: async url => ({ ok: true, url, text: async () => '<link rel="icon" href="/icon.png"><link rel="manifest" href="/manifest.json">', json: async () => { throw new SyntaxError('Invalid JSON'); } })
  });
  assert.equal(candidates[0].url, 'https://example.com/icon.png');
  let aborted = false;
  assert.deepEqual(await discoverSiteIcons('https://example.com', {
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('Aborted')); }))
  }), []);
  assert.equal(aborted, true);
});

test('client rejects transport failures instead of returning a cacheable no-icon result', async () => {
  await assert.rejects(resolveSiteIcon('https://example.com', { runtime: {} }), /unavailable/);
  await assert.rejects(resolveSiteIcon('https://example.com', { runtime: { sendMessage: async () => { throw new Error('Disconnected'); } } }), /Disconnected/);
  for (const response of [undefined, { ok: false, error: 'Background failed' }, { ok: true }]) {
    await assert.rejects(resolveSiteIcon('https://example.com', { runtime: { sendMessage: async () => response } }));
  }
  assert.equal(await resolveSiteIcon('https://example.com', { runtime: { sendMessage: async () => ({ ok: true, candidates: [] }) } }), null);
});

test('client skips unsafe and broken images, retaining the original successful resource URL', async () => {
  const checked = [];
  const model = await resolveSiteIcon('https://example.com', {
    runtime: { sendMessage: async message => {
      assert.deepEqual(message, { type: 'site-icons:discover', url: 'https://example.com' });
      return { ok: true, candidates: [{ url: 'javascript:alert(1)' }, { url: 'https://example.com/broken.png' }, { url: 'https://example.com/animated.svg', source: 'link:icon' }] };
    } },
    validateImage: async url => { checked.push(url); return url.endsWith('.svg'); }
  });
  assert.deepEqual(checked, ['https://example.com/broken.png', 'https://example.com/animated.svg']);
  assert.equal(model.value, 'https://example.com/animated.svg');
});
