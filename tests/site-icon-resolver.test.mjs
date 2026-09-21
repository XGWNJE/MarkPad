import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractManifestIconCandidates,
  extractSiteIconCandidates,
  fallbackFaviconCandidate,
  resolveSiteIcon
} from '../core/icons/SiteIconResolver.js';

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
  const model = await resolveSiteIcon('https://example.com/page', {
    fetchImpl: async url => {
      calls.push(url);
      return {
        ok: true,
        url,
        text: async () => '<link rel="icon" href="/animated.gif">',
        json: async () => ({})
      };
    },
    validateImage: async url => url === 'https://example.com/animated.gif'
  });

  assert.equal(model.value, 'https://example.com/animated.gif');
  assert.equal(model.source, 'site');
  assert.deepEqual(calls, ['https://example.com/page']);
});
