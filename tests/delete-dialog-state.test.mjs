import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { Element } from './helpers/dialog-harness.mjs';
import { deferred } from './helpers/grid-harness.mjs';

async function setup({ getNode, remove } = {}) {
  const document = { activeElement: null };
  document.createElement = (tag) => {
    const el = new Element(tag);
    el.ownerDocument = document;
    el.closest = () => null;
    return el;
  };
  const body = document.createElement('body');
  body.connected = true;
  const trigger = document.createElement('button');
  trigger.id = 'organize-trigger';
  body.appendChild(trigger);
  trigger.focus();
  const dialog = document.createElement('div');
  dialog.id = 'delete-confirm-dialog';
  dialog.className = 'dialog hidden';
  dialog.innerHTML =
    '<div class="dialog-overlay"></div><button data-action="close"></button><p id="delete-confirm-message"></p><div class="dialog-footer"><button data-action="cancel"></button><button id="delete-confirm-btn"></button></div>';
  body.appendChild(dialog);
  document.getElementById = (id) => body.querySelector('#' + id);
  const setOwner = (node) => {
    node.ownerDocument = document;
    node.children.forEach(setOwner);
  };
  setOwner(body);
  const calls = [],
    cards = new Map();
  for (const id of ['A', 'B', 'F']) {
    const el = document.createElement('button');
    body.appendChild(el);
    cards.set(id, { data: { title: id }, isFolder: id === 'F', element: el });
  }
  const grid = {
    cards,
    clearSelection() {
      this.cleared = true;
    },
    async deleteCard(id, isFolder) {
      calls.push([id, isFolder]);
      const ok = await remove?.(id);
      if (ok === false) return false;
      cards.get(id)?.element.remove();
      cards.delete(id);
      return true;
    }
  };
  const BookmarkStore = {
    getNode: getNode || (async (id) => ({ id, title: id, children: [{ id: 'child' }] })),
    countDescendants: (node) => node.children.length
  };
  const context = vm.createContext({ document, BookmarkStore, EventBus: { on() {} }, console });
  const source = (await readFile(new URL('../components/DeleteDialog.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '')
    .replace('export default DeleteDialog;', 'globalThis.Component=DeleteDialog;');
  vm.runInContext(source, context);
  const instance = new context.Component(grid);
  return {
    instance,
    calls,
    cards,
    grid,
    dialog,
    document,
    trigger,
    find: (s) => dialog.querySelector(s)
  };
}
const settle = () => new Promise((r) => setImmediate(r));

test('a drop request never deletes until the loaded confirmation is submitted', async () => {
  const h = await setup();
  h.instance.show({ id: 'A' });
  assert.equal(h.calls.length, 0);
  await settle();
  h.find('#delete-confirm-btn').click();
  await settle();
  assert.deepEqual(h.calls, [['A', false]]);
  assert.equal(h.dialog.classList.contains('hidden'), true);
  assert.equal(h.document.activeElement, h.trigger);
});
test('folder confirmation waits for child information and includes its count', async () => {
  const gate = deferred();
  const h = await setup({ getNode: () => gate.promise });
  h.instance.show({ id: 'F' });
  h.find('#delete-confirm-btn').click();
  assert.equal(h.calls.length, 0);
  assert.equal(h.find('#delete-confirm-btn').disabled, true);
  gate.resolve({ children: [{}] });
  await settle();
  assert.match(h.find('#delete-confirm-message').textContent, /1 个子项/);
  assert.equal(h.find('#delete-confirm-btn').disabled, false);
});
test('folder read failure stays locked and can retry', async () => {
  let fail = true;
  const h = await setup({
    getNode: async () => {
      if (fail) throw Error();
      return { children: [] };
    }
  });
  h.instance.show({ id: 'F' });
  await settle();
  assert.equal(h.find('#delete-confirm-btn').disabled, true);
  fail = false;
  await h.instance.load();
  assert.equal(h.find('#delete-confirm-btn').disabled, false);
  assert.match(h.find('#delete-confirm-message').textContent, /0 个子项/);
});
test('closing while reading invalidates the old result', async () => {
  const gate = deferred();
  const h = await setup({ getNode: () => gate.promise });
  h.instance.show({ id: 'F' });
  h.instance.hide();
  gate.resolve({ children: [] });
  await settle();
  assert.equal(h.dialog.classList.contains('hidden'), true);
  assert.equal(h.find('#delete-confirm-btn').disabled, true);
  assert.equal(h.calls.length, 0);
});
test('cancel restores the source focus without a bookmark write', async () => {
  const h = await setup();
  const source = h.cards.get('A').element;
  h.instance.show({ id: 'A', returnFocus: source });
  await settle();
  h.find('[data-action="cancel"]').click();
  assert.equal(h.calls.length, 0);
  assert.equal(h.document.activeElement, source);
});
test('batch failure retains only unfinished items and retry does not delete successful items twice', async () => {
  let failed = false;
  const h = await setup({
    remove: async (id) => {
      if (id === 'B' && !failed) {
        failed = true;
        return false;
      }
    }
  });
  h.instance.show({ ids: ['A', 'B'] });
  await settle();
  await h.instance.save();
  assert.deepEqual(h.calls, [
    ['A', false],
    ['B', false]
  ]);
  assert.equal(h.dialog.classList.contains('hidden'), false);
  assert.deepEqual(
    [...h.instance.items].map((i) => i.id),
    ['B']
  );
  await h.instance.save();
  assert.deepEqual(h.calls, [
    ['A', false],
    ['B', false],
    ['B', false]
  ]);
  assert.equal(h.dialog.classList.contains('hidden'), true);
});
test('pending deletion ignores duplicate confirmation', async () => {
  const gate = deferred();
  const h = await setup({ remove: () => gate.promise });
  h.instance.show({ id: 'A' });
  await settle();
  const pending = h.instance.save();
  await h.instance.save();
  assert.equal(h.calls.length, 1);
  gate.resolve(true);
  await pending;
  assert.equal(h.dialog.classList.contains('hidden'), true);
});

test('folder confirmation uses the current title and rejects a missing or non-folder source', async () => {
  let node = { title: '当前名称', children: [{}] };
  const h = await setup({ getNode: async () => node });
  h.instance.show({ id: 'F', title: '旧名称' });
  await settle();
  assert.match(h.find('#delete-confirm-message').textContent, /当前名称.*1 个子项/);
  node = null;
  h.instance.show({ id: 'F' });
  await settle();
  assert.equal(h.find('#delete-confirm-btn').disabled, true);
  node = { url: 'https://example.test/' };
  await h.instance.load();
  assert.equal(h.find('#delete-confirm-btn').disabled, true);
  assert.equal(h.calls.length, 0);
});
