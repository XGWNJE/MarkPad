import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

let registered;
const runtime = { id: 'markpad', getURL: path => `chrome-extension://markpad/${path}`, onMessage: { addListener: handler => { registered = handler; } } };
globalThis.chrome = { runtime };
const { createSiteIconMessageHandler } = await import('../background.js');
delete globalThis.chrome;
const sender = { id: runtime.id, url: runtime.getURL('index.html') };
const message = { type: 'site-icons:discover', url: 'https://example.com/page' };

test('manifest registers module worker and page resolver has no document fetch path', async () => {
  const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const manifest = JSON.parse(await read('manifest.json'));
  assert.deepEqual(manifest.background, { service_worker: 'background.js', type: 'module' });
  assert.equal(manifest.content_security_policy, undefined);
  assert.equal(typeof registered, 'function');
  assert.doesNotMatch(await read('core/icons/SiteIconResolver.js'), /\bfetch\b|SiteIconDiscovery|DOMParser|innerHTML/);
});

test('worker accepts only its own new-tab document and HTTP(S) requests', () => {
  const handler = createSiteIconMessageHandler(runtime, () => assert.fail('Unexpected discovery'));
  for (const invalidSender of [{}, { ...sender, id: 'another-extension' }, { ...sender, url: 'https://example.com' }, { ...sender, url: runtime.getURL('other.html') }]) {
    assert.equal(handler(message, invalidSender, () => assert.fail('Unexpected response')), false);
  }
  assert.equal(handler({ type: 'unrelated' }, sender, () => assert.fail('Unexpected response')), false);
  for (const url of ['file:///private', 'javascript:alert(1)', undefined]) {
    let response;
    assert.equal(handler({ ...message, url }, sender, result => { response = result; }), false);
    assert.equal(response.ok, false);
  }
});

test('worker keeps asynchronous channel open and returns only icon candidates', async () => {
  const candidates = [{ url: 'https://example.com/icon.png', source: 'link:icon', priority: 400 }];
  const handler = createSiteIconMessageHandler(runtime, async url => { assert.equal(url, message.url); return candidates; });
  const response = await new Promise(resolve => assert.equal(handler(message, { ...sender, url: `${sender.url}#folder` }, resolve), true));
  assert.deepEqual(response, { ok: true, candidates });
});

test('worker explicitly reports discovery failures', async () => {
  const handler = createSiteIconMessageHandler(runtime, async () => { throw new Error('Worker fault'); });
  const response = await new Promise(resolve => assert.equal(handler(message, sender, resolve), true));
  assert.deepEqual(response, { ok: false, error: 'Website icon discovery failed' });
});

test('store retains permanent negative cache but does not cache failed background transport', async t => {
  let calls = 0;
  const events = Object.fromEntries(['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered'].map(name => [name, { addListener() {} }]));
  globalThis.chrome = { bookmarks: events, runtime: { sendMessage: async () => { calls++; throw new Error('Disconnected'); } } };
  t.after(() => { delete globalThis.chrome; });
  const { default: store } = await import('../core/BookmarkStore.js');
  store.siteIcons = new Map();
  let saves = 0;
  t.mock.method(store, '_saveSiteIcons', () => { saves++; });
  const url = 'https://example.com/page';
  await assert.rejects(store.resolveSiteIcon(url), /Disconnected/);
  assert.equal(store.siteIcons.size, 0);
  assert.equal(store.siteIconPending.size, 0);
  assert.equal(saves, 0);
  chrome.runtime.sendMessage = async () => { calls++; return { ok: true, candidates: [] }; };
  assert.equal(await store.resolveSiteIcon(url), null);
  assert.equal(await store.resolveSiteIcon(url), null);
  assert.equal(calls, 2);
  assert.equal(saves, 1);
  store.clearSiteIcon(url);
  assert.equal(await store.resolveSiteIcon(url), null);
  assert.equal(calls, 3);
});
