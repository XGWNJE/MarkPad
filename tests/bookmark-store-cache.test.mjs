import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

function deferred() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}

async function setupStore(api) {
  const callbacks = new Map();
  const emitted = [];
  const bookmarks = Object.fromEntries(['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered'].map(name => [name, { addListener(callback) { callbacks.set(name, callback); } }]));
  Object.assign(bookmarks, api);
  const source = await readFile(new URL('../core/BookmarkStore.js', import.meta.url), 'utf8');
  const context = vm.createContext({ chrome: { bookmarks }, EventBus: { emit: (...args) => emitted.push(args) }, console: { error() {} } });
  vm.runInContext(source.replace(/^import[\s\S]*?;\r?\n/gm, '').replace('export default new BookmarkStore();', 'globalThis.store = new BookmarkStore();'), context);
  return { store: context.store, emitted, event: (name, ...args) => callbacks.get(name)(...args) };
}

test('late children reads cannot replace cache data fetched after a bookmark move', async () => {
  const oldResult = deferred();
  const oldChildren = [{ id: 'A', parentId: 'root', index: 0 }];
  const newChildren = [{ id: 'B', parentId: 'root', index: 0 }, { id: 'A', parentId: 'root', index: 1 }];
  let calls = 0;
  const { store, event } = await setupStore({ getChildren: async () => ++calls === 1 ? oldResult.promise : newChildren });
  const earlier = store.getChildren('root');
  event('onMoved', 'A', { oldParentId: 'root', parentId: 'root', oldIndex: 0, index: 1 });
  assert.deepEqual(await store.getChildren('root'), newChildren);
  oldResult.resolve(oldChildren);
  assert.deepEqual(await earlier, newChildren);
  assert.deepEqual(await store.getChildren('root'), newChildren);
  assert.equal(calls, 2, 'late results should reuse the current cache rather than overwrite it');
});

test('late tree reads cannot restore stale folder counts after an external move', async () => {
  const oldResult = deferred();
  const oldTree = [{ id: '0', children: [{ id: 'F', children: [] }] }];
  const newTree = [{ id: '0', children: [{ id: 'F', children: [{ id: 'A', url: 'https://a.example' }] }] }];
  let calls = 0;
  const { store, event } = await setupStore({ getTree: async () => ++calls === 1 ? oldResult.promise : newTree });
  const earlier = store.getTree();
  event('onMoved', 'A', { oldParentId: 'root', parentId: 'F', oldIndex: 0, index: 0 });
  assert.deepEqual(await store.getTree(), newTree);
  oldResult.resolve(oldTree);
  assert.deepEqual(await earlier, newTree);
  assert.equal((await store.getFolderChildCountMap()).get('F'), 1);
  assert.equal(calls, 2);
});

test('invalidation during a children request refetches before returning to the grid', async () => {
  const oldResult = deferred();
  let calls = 0;
  const { store, event } = await setupStore({ getChildren: async () => ++calls === 1 ? oldResult.promise : [{ id: 'new' }] });
  const request = store.getChildren('root');
  event('onCreated', 'new', { id: 'new', parentId: 'root' });
  oldResult.resolve([{ id: 'old' }]);
  assert.deepEqual(await request, [{ id: 'new' }]);
  assert.equal(calls, 2);
});

test('children failures reject instead of masquerading as an empty folder', async () => {
  let calls = 0;
  const { store } = await setupStore({ getChildren: async () => { if (++calls === 1) throw new Error('Read denied'); return [{ id: 'A' }]; } });
  await assert.rejects(store.getChildren('root'), /Read denied/);
  assert.deepEqual(await store.getChildren('root'), [{ id: 'A' }]);
  assert.equal(calls, 2, 'the failed read must not be cached as an empty result');
});
