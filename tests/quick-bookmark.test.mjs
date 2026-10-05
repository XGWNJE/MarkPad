import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import { createQuickBookmarkAction, QUICK_BOOKMARK_TITLE } from '../core/QuickBookmark.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flush() {
  for (let step = 0; step < 12; step++) await Promise.resolve();
}

function setup(options = {}) {
  const bookmarks = (options.bookmarks ?? []).map(bookmark => ({ ...bookmark }));
  const calls = { search: [], getTree: [], create: [], update: [], remove: [], feedback: [] };
  const roots = options.roots ?? [{ id: 'dynamic-bookmarks-bar', folderType: 'bookmarks-bar', title: 'Bookmarks bar' }];
  const api = {
    bookmarks: {
      async search(query) {
        calls.search.push({ ...query });
        if (options.search) return await options.search(query);
        return bookmarks.filter(bookmark => bookmark.url === query.url).map(bookmark => ({ ...bookmark }));
      },
      async getTree() {
        calls.getTree.push(true);
        if (options.getTree) return await options.getTree();
        return [{ id: 'root', children: roots }];
      },
      async create(details) {
        calls.create.push({ ...details });
        if (options.create) return await options.create(details);
        const bookmark = { id: `created-${bookmarks.length + 1}`, ...details };
        bookmarks.push(bookmark);
        return { ...bookmark };
      },
      async update(...args) {
        calls.update.push(args);
        throw new Error('Quick add must not update existing bookmarks');
      },
      async remove(...args) {
        calls.remove.push(args);
        throw new Error('Quick add must not remove existing bookmarks');
      }
    },
    action: Object.fromEntries(['setBadgeText', 'setBadgeBackgroundColor', 'setTitle'].map(method => [method, async details => {
      calls.feedback.push({ method, ...details });
    }]))
  };
  return { api, action: createQuickBookmarkAction(api), bookmarks, calls };
}

function lastFeedback(harness, method, tabId) {
  return harness.calls.feedback.filter(call => call.method === method && call.tabId === tabId).at(-1);
}

function assertBadge(harness, tabId, text) {
  assert.equal(lastFeedback(harness, 'setBadgeText', tabId)?.text, text);
}

test('the manifest exposes the quick-add toolbar action with packaged icons and no popup', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(QUICK_BOOKMARK_TITLE, 'MarkPad：点击添加当前页面到书签栏');
  assert.equal(manifest.action.default_title, QUICK_BOOKMARK_TITLE);
  assert.equal(manifest.action.default_popup, undefined);
  assert.ok(manifest.permissions.includes('bookmarks'));
  const iconPaths = Object.values(manifest.action.default_icon);
  assert.ok(iconPaths.length > 0);
  await Promise.all(iconPaths.map(path => access(new URL(`../${path}`, import.meta.url))));
});

test('the service worker registers the toolbar and tab lifecycle handlers and clicking the icon saves a page', async t => {
  const h = setup();
  const registered = {};
  const event = name => ({ addListener: handler => { registered[name] = handler; } });
  h.api.runtime = {
    id: 'markpad',
    getURL: path => `chrome-extension://markpad/${path}`,
    onMessage: event('message')
  };
  h.api.action.onClicked = event('click');
  h.api.tabs = { onUpdated: event('updated'), onRemoved: event('removed') };
  const previousChrome = globalThis.chrome;
  globalThis.chrome = h.api;
  t.after(() => {
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
  });
  await import('../background.js?quick-bookmark-test');
  for (const name of ['message', 'click', 'updated', 'removed']) {
    assert.equal(typeof registered[name], 'function', `${name} listener registered during module initialization`);
  }
  assert.equal(await registered.click({ id: 26, title: 'Worker page', url: 'https://example.com/worker' }), 'created');
  assert.deepEqual(h.calls.create, [{ parentId: 'dynamic-bookmarks-bar', title: 'Worker page', url: 'https://example.com/worker' }]);
  assertBadge(h, 26, '✓');
  await registered.updated(26, { status: 'loading' });
  assertBadge(h, 26, '');
  registered.removed(26);
});

test('quick add writes a normalized complete URL and trimmed title to the dynamic bookmarks bar', async () => {
  const h = setup();
  assert.equal(await h.action.handleClick({ id: 0, url: 'HTTPS://Example.COM/path?q=one#part', title: '  Example page  ' }), 'created');
  assert.deepEqual(h.calls.search, [{ url: 'https://example.com/path?q=one#part' }]);
  assert.deepEqual(h.calls.create, [{ parentId: 'dynamic-bookmarks-bar', title: 'Example page', url: 'https://example.com/path?q=one#part' }]);
  assertBadge(h, 0, '✓');
  for (const method of ['setBadgeText', 'setBadgeBackgroundColor', 'setTitle']) {
    assert.ok(h.calls.feedback.some(call => call.method === method && call.tabId === 0));
  }
  assert.ok(h.calls.feedback.every(call => call.tabId === 0), 'feedback must target the clicked tab');
});

test('blank or missing titles fall back to the complete normalized URL', async () => {
  for (const title of ['', '   ', undefined]) {
    const h = setup();
    assert.equal(await h.action.handleClick({ id: 1, url: 'https://example.com/?q=title#fallback', title }), 'created');
    assert.equal(h.calls.create[0].title, 'https://example.com/?q=title#fallback');
  }
});

test('HTTP and local file pages are supported alongside HTTPS', async () => {
  for (const url of ['http://example.com/page', 'file:///C:/Documents/manual.html#chapter']) {
    const h = setup();
    assert.equal(await h.action.handleClick({ id: 2, url }), 'created');
    assert.equal(h.calls.create[0].url, new URL(url).href);
  }
});

test('an existing bookmark in any folder is preserved and never copied, updated or removed', async () => {
  const existing = { id: 'saved', parentId: 'other-folder', title: 'My existing title', url: 'https://example.com/page?q=one#part' };
  const h = setup({ bookmarks: [existing] });
  assert.equal(await h.action.handleClick({ id: 3, url: existing.url, title: 'Changed page title' }), 'exists');
  assert.deepEqual(h.bookmarks, [existing]);
  assert.deepEqual(h.calls.create, []);
  assert.deepEqual(h.calls.update, []);
  assert.deepEqual(h.calls.remove, []);
  assertBadge(h, 3, '=');
});

test('query strings and fragments distinguish complete URLs during duplicate detection', async () => {
  const url = 'https://example.com/page?q=one#part';
  const h = setup({ bookmarks: [
    { id: 'different-query', url: 'https://example.com/page?q=two#part' },
    { id: 'different-fragment', url: 'https://example.com/page?q=one#other' },
    { id: 'without-fragment', url: 'https://example.com/page?q=one' }
  ] });
  assert.equal(await h.action.handleClick({ id: 4, url }), 'created');
  assert.equal(h.calls.create[0].url, url);
  assert.equal(await h.action.handleClick({ id: 4, url }), 'exists');
  assert.equal(h.calls.create.length, 1);
});

test('restricted schemes and invalid URLs show unsupported feedback without touching bookmarks', async () => {
  const urls = ['chrome://newtab/', 'chrome-extension://extension/index.html', 'about:blank', 'data:text/plain,test', 'javascript:void(0)', 'ftp://example.com/file', 'invalid url', '', undefined];
  for (const url of urls) {
    const h = setup();
    assert.equal(await h.action.handleClick({ id: 5, url }), 'unsupported', String(url));
    assert.deepEqual(h.calls.search, []);
    assert.deepEqual(h.calls.getTree, []);
    assert.deepEqual(h.calls.create, []);
    assertBadge(h, 5, '?');
  }
});

test('missing, negative, fractional and nonnumeric tab IDs do not invoke Chrome APIs', async () => {
  for (const tab of [undefined, null, {}, { id: -1 }, { id: 1.5 }, { id: '1' }, { id: NaN }, { id: Infinity }]) {
    const h = setup();
    assert.equal(await h.action.handleClick(tab), undefined);
    assert.ok(Object.values(h.calls).every(calls => calls.length === 0));
  }
});

test('a pending navigation to a different URL prevents adding the old page', async () => {
  const h = setup();
  assert.equal(await h.action.handleClick({ id: 6, url: 'https://example.com/old', pendingUrl: 'https://example.com/new' }), 'loading');
  assert.deepEqual(h.calls.search, []);
  assert.deepEqual(h.calls.create, []);
  assertBadge(h, 6, '?');
});

test('a pending URL matching the current URL still allows quick add', async () => {
  const h = setup();
  const url = 'https://example.com/current';
  assert.equal(await h.action.handleClick({ id: 7, url, pendingUrl: url }), 'created');
  assert.equal(h.calls.create.length, 1);
});

test('simultaneous clicks in one or several tabs share one bookmark write for the same URL', async () => {
  const search = deferred();
  const h = setup({ search: () => search.promise });
  const url = 'https://example.com/shared?q=one#part';
  const first = h.action.handleClick({ id: 8, url, title: 'First title' });
  const repeat = h.action.handleClick({ id: 8, url, title: 'Repeated title' });
  const otherTab = h.action.handleClick({ id: 9, url, title: 'Other tab title' });
  await flush();
  assert.equal(h.calls.search.length, 1);
  search.resolve([]);
  const results = await Promise.all([first, repeat, otherTab]);
  assert.ok(results.every(result => result === 'created' || result === 'exists'));
  assert.equal(h.calls.create.length, 1);
  assert.equal(h.calls.create[0].url, url);
  assert.ok(['✓', '='].includes(lastFeedback(h, 'setBadgeText', 8)?.text));
  assert.ok(['✓', '='].includes(lastFeedback(h, 'setBadgeText', 9)?.text));
});

test('simultaneous clicks for distinct complete URLs each save their own page', async () => {
  const h = setup();
  const urls = ['https://example.com/page?q=one', 'https://example.com/page?q=two', 'https://example.com/page?q=one#part'];
  const results = await Promise.all(urls.map((url, index) => h.action.handleClick({ id: index + 10, url })));
  assert.deepEqual(results, ['created', 'created', 'created']);
  assert.deepEqual(h.calls.create.map(bookmark => bookmark.url).sort(), [...urls].sort());
});

for (const failingMethod of ['search', 'getTree', 'create']) {
  test(`a ${failingMethod} failure is reported and a later click can retry the same URL`, async () => {
    let fail = true;
    const options = {};
    options[failingMethod] = async details => {
      if (fail) throw new Error(`${failingMethod} denied`);
      if (failingMethod === 'search') return [];
      if (failingMethod === 'getTree') return [{ id: 'root', children: [{ id: 'retry-bar', folderType: 'bookmarks-bar' }] }];
      return { id: 'retry-bookmark', ...details };
    };
    const h = setup(options);
    const tab = { id: 13, url: 'https://example.com/retry' };
    assert.equal(await h.action.handleClick(tab), 'failed');
    assertBadge(h, 13, '!');
    fail = false;
    assert.equal(await h.action.handleClick(tab), 'created');
    assertBadge(h, 13, '✓');
    assert.equal(h.calls[failingMethod].length, 2);
  });
}

test('bookmarks-bar detection skips managed roots and never assumes the fixed ID 1', async () => {
  const h = setup({ roots: [
    { id: '1', folderType: 'other', title: 'Other bookmarks' },
    { id: 'managed-bar', folderType: 'bookmarks-bar', unmodifiable: 'managed' },
    { id: 'managed-folder', unmodifiable: 'managed' },
    { id: 'synced-bar-42', folderType: 'bookmarks-bar', title: 'Bookmarks bar' }
  ] });
  assert.equal(await h.action.handleClick({ id: 14, url: 'https://example.com/dynamic' }), 'created');
  assert.equal(h.calls.create[0].parentId, 'synced-bar-42');
});

test('multiple writable bookmarks bars select the first root in API order', async () => {
  const h = setup({ roots: [
    { id: 'first-bar', folderType: 'bookmarks-bar' },
    { id: 'second-bar', folderType: 'bookmarks-bar' }
  ] });
  assert.equal(await h.action.handleClick({ id: 15, url: 'https://example.com/first-root' }), 'created');
  assert.equal(h.calls.create[0].parentId, 'first-bar');
});

test('older Chrome trees without folderType use the first writable folder root', async () => {
  const h = setup({ roots: [
    { id: 'root-bookmark', url: 'https://example.com/not-a-folder' },
    { id: 'managed-root', unmodifiable: 'managed' },
    { id: 'legacy-bar-99', title: '书签栏' },
    { id: 'legacy-other', title: 'Other bookmarks' }
  ] });
  assert.equal(await h.action.handleClick({ id: 16, url: 'https://example.com/legacy' }), 'created');
  assert.equal(h.calls.create[0].parentId, 'legacy-bar-99');
});

test('typed root trees with no writable bookmarks bar fail without falling back to another folder', async () => {
  for (const roots of [
    [{ id: 'other-root', folderType: 'other' }, { id: 'untyped-root' }],
    [{ id: 'managed-bar', folderType: 'bookmarks-bar', unmodifiable: 'managed' }, { id: 'other-root' }],
    [{ id: 'bar-bookmark', folderType: 'bookmarks-bar', url: 'https://example.com/not-a-folder' }]
  ]) {
    const h = setup({ roots });
    assert.equal(await h.action.handleClick({ id: 17, url: 'https://example.com/no-bar' }), 'failed');
    assert.deepEqual(h.calls.create, []);
    assertBadge(h, 17, '!');
  }
});

test('a tree without any writable root folder fails without creating in an assumed location', async () => {
  for (const roots of [[], [{ id: 'managed-root', unmodifiable: 'managed' }]]) {
    const h = setup({ roots });
    assert.equal(await h.action.handleClick({ id: 18, url: 'https://example.com/no-root' }), 'failed');
    assert.deepEqual(h.calls.create, []);
  }
});

test('the bookmarks bar is resolved from the current tree for each new URL', async () => {
  let currentBarId = 'first-current-bar';
  const h = setup({ getTree: async () => [{ id: 'root', children: [{ id: currentBarId, folderType: 'bookmarks-bar' }] }] });
  assert.equal(await h.action.handleClick({ id: 19, url: 'https://example.com/first' }), 'created');
  currentBarId = 'second-current-bar';
  assert.equal(await h.action.handleClick({ id: 19, url: 'https://example.com/second' }), 'created');
  assert.deepEqual(h.calls.create.map(bookmark => bookmark.parentId), ['first-current-bar', 'second-current-bar']);
});

test('badge and title API failures do not turn a completed bookmark write into a failure', async () => {
  for (const method of ['setBadgeText', 'setBadgeBackgroundColor', 'setTitle']) {
    for (const failure of ['throw', 'reject']) {
      const h = setup();
      h.api.action[method] = details => {
        h.calls.feedback.push({ method, ...details });
        if (failure === 'throw') throw new Error(`${method} unavailable`);
        return Promise.reject(new Error(`${method} unavailable`));
      };
      assert.equal(await h.action.handleClick({ id: 20, url: 'https://example.com/feedback-error' }), 'created', `${method} ${failure}`);
      assert.equal(h.calls.create.length, 1);
      assert.equal(await h.action.handleClick({ id: 20, url: 'https://example.com/feedback-error' }), 'exists');
      assert.equal(h.calls.create.length, 1);
    }
  }
});

test('unrelated tab updates leave the current feedback intact', async () => {
  const h = setup();
  await h.action.handleClick({ id: 21, url: 'https://example.com/current' });
  const before = h.calls.feedback.length;
  await h.action.handleTabUpdated(21, { status: 'complete' });
  await h.action.handleTabUpdated(21, { title: 'Changed title' });
  await flush();
  assert.equal(h.calls.feedback.length, before);
  assertBadge(h, 21, '✓');
});

for (const changeInfo of [{ url: 'https://example.com/new' }, { status: 'loading' }]) {
  test(`navigation update ${JSON.stringify(changeInfo)} resets badge and action title`, async () => {
    const h = setup();
    await h.action.handleClick({ id: 22, url: 'https://example.com/old' });
    await h.action.handleTabUpdated(22, changeInfo);
    await flush();
    assertBadge(h, 22, '');
    assert.equal(lastFeedback(h, 'setTitle', 22)?.title, QUICK_BOOKMARK_TITLE);
    assert.ok(h.calls.feedback.every(call => call.tabId === 22));
  });
}

test('a bookmark result arriving after navigation cannot restore feedback for the old page', async () => {
  const write = deferred();
  const h = setup({ create: () => write.promise });
  const oldClick = h.action.handleClick({ id: 23, url: 'https://example.com/old' });
  await flush();
  assert.equal(h.calls.create.length, 1);
  await h.action.handleTabUpdated(23, { url: 'https://example.com/new' });
  await flush();
  const afterReset = h.calls.feedback.length;
  assertBadge(h, 23, '');
  write.resolve({ id: 'saved-old-page', ...h.calls.create[0] });
  assert.equal(await oldClick, 'created');
  await flush();
  assert.equal(h.calls.feedback.length, afterReset);
  assertBadge(h, 23, '');
  assert.equal(lastFeedback(h, 'setTitle', 23)?.title, QUICK_BOOKMARK_TITLE);
});

test('a bookmark result arriving after its tab closes cannot write feedback to that tab', async () => {
  const write = deferred();
  const h = setup({ create: () => write.promise });
  const oldClick = h.action.handleClick({ id: 24, url: 'https://example.com/closed' });
  await flush();
  assert.equal(h.calls.create.length, 1);
  await h.action.handleTabRemoved(24);
  await flush();
  const afterClose = h.calls.feedback.length;
  write.resolve({ id: 'saved-closed-page', ...h.calls.create[0] });
  assert.equal(await oldClick, 'created');
  await flush();
  assert.equal(h.calls.feedback.length, afterClose);
});

test('a newer click in the same tab owns feedback even when an older URL completes later', async () => {
  const oldWrite = deferred();
  const newUrl = 'https://example.com/new';
  const h = setup({
    bookmarks: [{ id: 'already-saved-new-page', parentId: 'elsewhere', url: newUrl }],
    create: () => oldWrite.promise
  });
  const oldClick = h.action.handleClick({ id: 25, url: 'https://example.com/old' });
  await flush();
  assert.equal(h.calls.create.length, 1);
  assert.equal(await h.action.handleClick({ id: 25, url: newUrl }), 'exists');
  assertBadge(h, 25, '=');
  const afterNewClick = h.calls.feedback.length;
  oldWrite.resolve({ id: 'saved-old-page', ...h.calls.create[0] });
  assert.equal(await oldClick, 'created');
  await flush();
  assert.equal(h.calls.feedback.length, afterNewClick);
  assertBadge(h, 25, '=');
});
