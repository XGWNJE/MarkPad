import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

let registered;
const runtime = { id: 'markpad', getURL: path => `chrome-extension://markpad/${path}`, onMessage: { addListener: handler => { registered = handler; } } };
globalThis.chrome = {
  runtime,
  action: { onClicked: { addListener() {} } },
  tabs: { onUpdated: { addListener() {} }, onRemoved: { addListener() {} } }
};
const { createSiteIconMessageHandler } = await import('../background.js');
delete globalThis.chrome;
const sender = { id: runtime.id, url: runtime.getURL('index.html') };
const message = { type: 'site-icons:discover', url: 'https://example.com/page' };
const ICON = { dataUrl: 'data:image/png;base64,AA==', byteLength: 2, contentType: 'image/png' };

test('manifest registers module worker and page resolver has no document fetch path', async () => {
  const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const manifest = JSON.parse(await read('manifest.json'));
  assert.deepEqual(manifest.background, { service_worker: 'background.js', type: 'module' });
  assert.equal(manifest.content_security_policy, undefined);
  assert.equal(typeof registered, 'function');
  // 页面侧只允许解码本地字节，不得自己抓取网页或注入标记。
  assert.doesNotMatch(await read('core/icons/SiteIconResolver.js'), /\bfetch\s*\(|SiteIconDiscovery|DOMParser|innerHTML/);
});

test('worker accepts only its own new-tab document and HTTP(S) requests', () => {
  const handler = createSiteIconMessageHandler(runtime, () => assert.fail('Unexpected discovery'), () => assert.fail('Unexpected download'));
  for (const invalidSender of [{}, { ...sender, id: 'another-extension' }, { ...sender, url: 'https://example.com' }, { ...sender, url: runtime.getURL('other.html') }]) {
    for (const type of ['site-icons:discover', 'site-icons:fetch']) {
      assert.equal(handler({ ...message, type }, invalidSender, () => assert.fail('Unexpected response')), false);
    }
  }
  assert.equal(handler({ type: 'unrelated' }, sender, () => assert.fail('Unexpected response')), false);
  for (const url of ['file:///private', 'javascript:alert(1)', undefined]) {
    for (const type of ['site-icons:discover', 'site-icons:fetch']) {
      let response;
      assert.equal(handler({ ...message, type, url }, sender, result => { response = result; }), false);
      assert.equal(response.ok, false);
    }
  }
});

test('worker keeps asynchronous channel open and returns only icon candidates', async () => {
  const candidates = [{ url: 'https://example.com/icon.png', source: 'link:icon', priority: 400 }];
  const handler = createSiteIconMessageHandler(runtime, async url => {
    assert.equal(url, message.url);
    return { candidates, reachable: true };
  });
  const response = await new Promise(resolve => assert.equal(handler(message, { ...sender, url: `${sender.url}#folder` }, resolve), true));
  assert.deepEqual(response, { ok: true, candidates, reachable: true });
});

test('worker downloads icon bytes through a separate guarded endpoint', async () => {
  const handler = createSiteIconMessageHandler(runtime, () => assert.fail('Unexpected discovery'), async url => {
    assert.equal(url, 'https://example.com/icon.png');
    return ICON;
  });
  const response = await new Promise(resolve => assert.equal(handler({ type: 'site-icons:fetch', url: 'https://example.com/icon.png' }, sender, resolve), true));
  assert.deepEqual(response, { ok: true, ...ICON });
});

test('worker explicitly reports discovery and download failures', async () => {
  const failing = createSiteIconMessageHandler(runtime, async () => { throw new Error('Worker fault'); }, async () => { throw new Error('Worker fault'); });
  const discovery = await new Promise(resolve => assert.equal(failing(message, sender, resolve), true));
  assert.deepEqual(discovery, { ok: false, error: 'Website icon discovery failed' });
  const download = await new Promise(resolve => assert.equal(failing({ type: 'site-icons:fetch', url: 'https://example.com/icon.png' }, sender, resolve), true));
  assert.deepEqual(download, { ok: false, error: 'Website icon download failed' });
});

async function setupStore(t, handleMessage, { mockSave = true } = {}) {
  const events = Object.fromEntries(['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered'].map(name => [name, { addListener() {} }]));
  const calls = [];
  globalThis.chrome = {
    bookmarks: events,
    storage: { local: { set: async () => {}, get: async () => ({}), remove: async () => {} } },
    runtime: { sendMessage: async message => { calls.push(message); return handleMessage(message); } }
  };
  t.after(() => { delete globalThis.chrome; });
  const { default: store } = await import('../core/BookmarkStore.js');
  if (store.siteIconSaveTimer !== null) clearTimeout(store.siteIconSaveTimer);
  store.siteIconSaveTimer = null;
  store.storageInitialized = true;
  store.siteIcons = new Map();
  store.siteIconPending.clear();
  store.siteIconEpochs.clear();
  store.siteIconBudget = 2_000_000;
  if (mockSave) t.mock.method(store, '_saveSiteIcons', () => {});
  return { store, calls };
}

/** Minimal Image stand-in so the page-side byte validation can succeed under Node. */
function useImageStub(t) {
  const previous = globalThis.Image;
  globalThis.Image = class {
    constructor() {
      this.naturalWidth = 16;
      this.naturalHeight = 16;
    }
    set src(value) {
      this._src = value;
      queueMicrotask(() => this.onload?.());
    }
    get src() {
      return this._src;
    }
  };
  t.after(() => { globalThis.Image = previous; });
}

test('store keeps local icon bytes and retries failures on a schedule instead of caching them forever', async t => {
  const url = 'https://example.com/page';
  const { store, calls } = await setupStore(t, () => ({ ok: true, candidates: [], reachable: false }));

  // 后台通信异常向上抛出，绝不写入缓存。
  globalThis.chrome.runtime.sendMessage = async () => { throw new Error('Disconnected'); };
  await assert.rejects(store.resolveSiteIcon(url), /Disconnected/);
  assert.equal(store.siteIcons.size, 0);
  assert.equal(store.siteIconPending.size, 0);

  // 失败结果带退避时间，冷却期内不重复请求后台。
  globalThis.chrome.runtime.sendMessage = async message => { calls.push(message); return { ok: true, candidates: [], reachable: false }; };
  assert.equal(await store.resolveSiteIcon(url), null);
  const failure = store.siteIcons.get(url);
  assert.equal(failure.model, null);
  assert.equal(failure.failure, 'unreachable');
  assert.ok(failure.retryAt > Date.now());
  const callsAfterFailure = calls.length;
  assert.equal(await store.resolveSiteIcon(url), null);
  assert.equal(calls.length, callsAfterFailure, 'the retry window must suppress repeated background requests');
  assert.equal(store.getSiteIcon(url), null);

  // 退避到期后自动重新解析，网络抖动不会变成永久无图标。
  t.mock.timers.enable({ apis: ['Date'], now: failure.retryAt + 1 });
  assert.equal(await store.resolveSiteIcon(url), null);
  assert.equal(calls.length, callsAfterFailure + 1);
  assert.equal(store.siteIcons.get(url).attempts, 2);
  t.mock.timers.reset();

  store.clearSiteIcon(url);
  assert.equal(await store.resolveSiteIcon(url), null);
  assert.equal(calls.length, callsAfterFailure + 2);
});

test('store caches downloaded bytes and then serves them without contacting the website', async t => {
  const url = 'https://example.com/page';
  const dataUrl = 'data:image/png;base64,AA==';
  useImageStub(t);
  const { store, calls } = await setupStore(t, message => message.type === 'site-icons:discover'
    ? { ok: true, candidates: [{ url: 'https://example.com/icon.png', source: 'link:icon' }], reachable: true }
    : { ok: true, dataUrl, byteLength: 2, contentType: 'image/png' });

  const model = await store.resolveSiteIcon(url);
  assert.equal(model.value, dataUrl);
  assert.equal(model.matchReason, 'link:icon');
  assert.equal(store.siteIcons.get(url).model.value, dataUrl);

  const backgroundCalls = calls.length;
  const again = await store.resolveSiteIcon(url);
  assert.equal(again.value, dataUrl);
  assert.equal(calls.length, backgroundCalls, 'cached bytes must never trigger another website request');
  assert.equal(store.getSiteIcon(url).value, dataUrl);
});

test('site icon cache evicts the oldest entries once it exceeds the size budget', async t => {
  const { store } = await setupStore(t, () => ({ ok: true, candidates: [], reachable: false }));
  const payload = `data:image/png;base64,${'A'.repeat(800_000)}`;
  // 三条共约 2.4M 字符，超过 2M 上限后只淘汰最久未校验的一条。
  store.siteIcons.set('https://old.example', { model: { type: 'image', value: payload, source: 'site' }, checkedAt: 1 });
  store.siteIcons.set('https://middle.example', { model: { type: 'image', value: payload, source: 'site' }, checkedAt: 2 });
  store.siteIcons.set('https://new.example', { model: { type: 'image', value: payload, source: 'site' }, checkedAt: 3 });

  store._evictSiteIcons();
  assert.deepEqual([...store.siteIcons.keys()], ['https://middle.example', 'https://new.example']);
});

test('a burst of icon resolutions and hidden pages write the cache only once per batch', async t => {
  const { store } = await setupStore(t, () => ({ ok: true, candidates: [], reachable: false }), { mockSave: false });
  const writes = [];
  t.mock.method(store, '_writeChromeStorageObject', (key, value) => writes.push([key, Object.keys(value).length]));
  t.mock.method(store, '_writeLocalStorageObject', () => {});
  t.mock.timers.enable({ apis: ['setTimeout'] });

  await Promise.all(['https://a.example', 'https://b.example', 'https://c.example'].map(url => store.resolveSiteIcon(url)));
  assert.deepEqual(writes, [], 'notifications are merged into one pending write');
  t.mock.timers.tick(300);
  assert.deepEqual(writes, [['site_icon_cache_v3', 3]]);

  // 页面隐藏或卸载时立即落盘，合并写入不会丢失。
  await store.resolveSiteIcon('https://d.example');
  assert.equal(writes.length, 1);
  store._flushSiteIcons();
  assert.deepEqual(writes, [['site_icon_cache_v3', 3], ['site_icon_cache_v3', 4]]);
});

test('initStorage drops the v2 cache and every localStorage mirror of the icon cache', async t => {
  const events = Object.fromEntries(['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered'].map(name => [name, { addListener() {} }]));
  const stored = {
    site_icon_cache_v2: { 'https://legacy.example/': { model: { type: 'image', value: 'https://legacy.example/favicon.ico' } } },
    site_icon_cache_v3: { 'https://kept.example/': { model: { type: 'image', value: 'data:image/png;base64,AA==' }, checkedAt: 1 } }
  };
  const removed = [];
  const localStore = new Map([
    ['site_icon_cache_v2', '{"legacy":true}'],
    ['site_icon_cache_v3', '{"https://stale.example/":{"model":{"type":"image","value":"https://stale.example/favicon.ico"}}}']
  ]);
  globalThis.chrome = {
    bookmarks: events,
    storage: { local: {
      get: async key => Object.fromEntries((Array.isArray(key) ? key : [key]).filter(k => stored[k] !== undefined).map(k => [k, stored[k]])),
      set: async () => {},
      remove: async key => { removed.push(key); delete stored[key]; }
    } }
  };
  globalThis.localStorage = {
    getItem: key => (localStore.has(key) ? localStore.get(key) : null),
    setItem: (key, value) => localStore.set(key, String(value)),
    removeItem: key => localStore.delete(key)
  };
  t.after(() => { delete globalThis.chrome; delete globalThis.localStorage; });

  const { default: store } = await import('../core/BookmarkStore.js');
  store.storageInitialized = false;
  store.siteIcons = null;
  await store.initStorage();

  assert.deepEqual(removed, ['site_icon_cache_v2'], '只保存远程地址的 v2 缓存必须清除');
  assert.deepEqual([...store.siteIcons.keys()], ['https://kept.example/'], 'localStorage 里的过期副本不能合并回来');
  assert.equal(localStore.has('site_icon_cache_v2'), false);
  assert.equal(localStore.has('site_icon_cache_v3'), false, '图标缓存的 localStorage 镜像不再保留');
  assert.equal(store.getSiteIcon('https://stale.example'), null);
});

test('the site icon cache is never mirrored into localStorage', async t => {
  const { store } = await setupStore(t, () => ({ ok: true, candidates: [], reachable: false }), { mockSave: false });
  const writes = [];
  const localWrites = [];
  t.mock.method(store, '_writeChromeStorageObject', (key, value) => writes.push([key, Object.keys(value).length]));
  const previousLocalStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => null, setItem: key => localWrites.push(key), removeItem() {} };
  t.after(() => { globalThis.localStorage = previousLocalStorage; });

  await store.resolveSiteIcon('https://a.example');
  store._flushSiteIcons();
  assert.deepEqual(writes, [['site_icon_cache_v3', 1]]);
  assert.deepEqual(localWrites, [], '过期副本会复活已淘汰或已清除的条目');
});

test('eviction keeps the most recently used bytes and drops failures last', async t => {
  const { store } = await setupStore(t, () => ({ ok: true, candidates: [], reachable: false }));
  const payload = `data:image/png;base64,${'A'.repeat(80_000)}`;
  const iconEntry = checkedAt => ({ model: { type: 'image', value: payload, byteLength: 80_000, source: 'site' }, checkedAt });
  store.siteIcons.set('https://a.example/', iconEntry(10));
  store.siteIcons.set('https://b.example/', iconEntry(20));
  store.siteIcons.set('https://c.example/', { model: null, failure: 'unreachable', checkedAt: 1, retryAt: Date.now() + 60_000 });
  store.siteIconBudget = 200_000;

  // 命中 a 后它成为最近使用，淘汰应落在 b 上，体积很小的失败记录留到最后。
  store.getSiteIconEntry('https://a.example');
  store._evictSiteIcons();
  assert.deepEqual([...store.siteIcons.keys()], ['https://a.example/', 'https://c.example/']);
});

test('a rejected storage write halves the budget and flushes again', async t => {
  const { store } = await setupStore(t, () => ({ ok: true, candidates: [], reachable: false }), { mockSave: false });
  const payload = `data:image/png;base64,${'A'.repeat(80_000)}`;
  const iconEntry = checkedAt => ({ model: { type: 'image', value: payload, byteLength: 80_000, source: 'site' }, checkedAt });
  for (const [index, key] of ['https://a.example/', 'https://b.example/', 'https://c.example/', 'https://d.example/'].entries()) {
    store.siteIcons.set(key, iconEntry(index + 1));
  }
  store.siteIconBudget = 500_000;
  const attempted = [];
  let rejectFirst = true;
  t.mock.method(store, '_writeChromeStorageObject', (key, value) => {
    attempted.push(Object.keys(value).length);
    if (rejectFirst) {
      rejectFirst = false;
      return Promise.reject(new Error('QUOTA_BYTES exceeded'));
    }
    return Promise.resolve();
  });

  store._flushSiteIcons();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(attempted, [4, 2], '写入被拒绝后应按半预算淘汰再写一次');
  assert.equal(store.siteIconBudget, 250_000);
});

test('clearing an address discards the resolution that is still running', async t => {
  const url = 'https://example.com/page';
  const dataUrl = 'data:image/png;base64,AA==';
  useImageStub(t);
  const { store, calls } = await setupStore(t, message => message.type === 'site-icons:discover'
    ? { ok: true, candidates: [{ url: 'https://example.com/icon.png', source: 'link:icon' }], reachable: true }
    : { ok: true, dataUrl, byteLength: 2, contentType: 'image/png' });

  const first = store.resolveSiteIcon(url);
  store.clearSiteIcon(url);
  assert.equal(store.siteIconPending.size, 0, '清除后不再复用进行中的旧请求');
  assert.equal(await first, null, '迟到的结果必须丢弃');
  assert.equal(store.siteIcons.has(url), false, '迟到的结果不能写回已清除的缓存');

  const callsBefore = calls.length;
  const model = await store.resolveSiteIcon(url);
  assert.equal(model.value, dataUrl);
  assert.ok(calls.length > callsBefore, '清除后的解析必须重新请求');
});
