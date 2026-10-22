import assert from 'node:assert/strict';
import test from 'node:test';
import { setupDialog } from './helpers/dialog-harness.mjs';
import { deferred } from './helpers/grid-harness.mjs';
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('move target loading failure uses a stable status and a new opening can retry', async () => {
  const { instance, find, store } = await setupDialog('MoveDialog', {
    getFolderTree: async () => {
      throw new Error('read denied');
    }
  });
  await instance.show('A');
  assert.equal(find('#move-dialog-confirm').textContent, '确认');
  assert.equal(find('#move-dialog-confirm').disabled, true);
  assert.equal(find('#move-dialog-tree').getAttribute('aria-busy'), 'false');
  assert.equal(find('.dialog-status').classList.contains('error'), true);
  store.getFolderTree = async () => [{ id: 'F', title: '目标文件夹' }];
  await instance.show('A');
  assert.equal(find('.dialog-status').classList.contains('error'), false);
  assert.equal(find('.folder-tree-item').textContent, '目标文件夹');
});

test('move busy state prevents duplicate writes and failure preserves the selected target', async () => {
  const gate = deferred();
  const calls = [];
  const { instance, find, dialog, store, trigger } = await setupDialog('MoveDialog', {
    move(...args) {
      calls.push(args);
      return gate.promise;
    }
  });
  await instance.show('A', trigger);
  const target = dialog.querySelectorAll('.folder-tree-item')[1];
  target.click();
  await settle();
  const confirm = find('#move-dialog-confirm');
  const moving = instance.confirm();
  await instance.confirm();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ['A', 'F']);
  assert.equal(confirm.disabled, true);
  assert.equal(confirm.getAttribute('aria-busy'), 'true');
  assert.equal(target.disabled, true);
  gate.reject(new Error('move denied'));
  await moving;
  assert.equal(dialog.classList.contains('hidden'), false);
  assert.equal(instance.selectedTargetId, 'F');
  assert.equal(target.getAttribute('aria-pressed'), 'true');
  assert.equal(target.disabled, false);
  assert.equal(confirm.disabled, false);
  assert.equal(confirm.textContent, '确认');
  assert.match(find('.dialog-status').textContent, /重试/);
  store.move = async () => {};
  await instance.confirm();
  assert.equal(dialog.classList.contains('hidden'), true);
  assert.equal(trigger.focusCount, 2);
});

test('late move completion does not clear the busy state of a later session', async () => {
  const first = deferred();
  const second = deferred();
  let call = 0;
  const { instance, find, dialog } = await setupDialog('MoveDialog', {
    move: () => (++call === 1 ? first.promise : second.promise)
  });
  await instance.show('A');
  find('[data-id="F"]').click();
  await settle();
  const oldMove = instance.confirm();
  instance.hide();
  await instance.show('B');
  find('[data-id="F"]').click();
  await settle();
  const currentMove = instance.confirm();
  first.resolve();
  await oldMove;
  assert.equal(dialog.classList.contains('hidden'), false);
  assert.equal(find('#move-dialog-confirm').disabled, true);
  assert.equal(find('#move-dialog-confirm').getAttribute('aria-busy'), 'true');
  second.resolve();
  await currentMove;
  assert.equal(dialog.classList.contains('hidden'), true);
});

test('same-folder sorting uses Chrome insertion slots and preserves the order of a batch', async () => {
  let order = ['A', 'B', 'C', 'D'];
  const calls = [];
  const node = (id) => ({ id, title: id, parentId: 'root', index: order.indexOf(id) });
  const { instance, find } = await setupDialog('MoveDialog', {
    getChildren: async () => order.map(node),
    getNode: async (id) => node(id),
    move: async (id, parentId, index = order.length) => {
      calls.push([id, parentId, index]);
      const from = order.indexOf(id);
      order.splice(from, 1);
      order.splice(index > from ? index - 1 : index, 0, id);
    }
  });
  await instance.show(['C', 'D']);
  assert.equal(find('[data-id="root"]').disabled, false);
  assert.match(find('[data-id="root"]').textContent, /当前位置/);
  find('#move-position').value = 'first';
  await instance.confirm();
  assert.deepEqual(order, ['C', 'D', 'A', 'B']);
  assert.deepEqual(calls, [
    ['C', 'root', 0],
    ['D', 'root', 1]
  ]);
  await instance.show(['C', 'D']);
  find('#move-position').value = 'B';
  await instance.confirm();
  assert.deepEqual(order, ['A', 'C', 'D', 'B']);
  await instance.show('A');
  find('#move-position').value = 'last';
  await instance.confirm();
  assert.deepEqual(order, ['C', 'D', 'B', 'A']);
});

test('failed sorting retains both targets and a missing source cannot move', async () => {
  const { instance, find, store } = await setupDialog('MoveDialog', {
    move: async () => {
      throw new Error('move denied');
    }
  });
  await instance.show('A');
  find('[data-id="F"]').click();
  await settle();
  await instance.confirm();
  assert.equal(find('[data-id="root"]').disabled, false);
  assert.equal(find('[data-id="F"]').disabled, false);
  store.getNode = async () => null;
  await instance.show('missing');
  assert.equal(find('#move-dialog-confirm').disabled, true);
  assert.equal(find('.dialog-status').classList.contains('error'), true);
  assert.equal(find('.folder-tree-item'), null);
});

test('a partial batch move retries only unfinished items', async () => {
  const calls = [];
  let failed = false;
  const { instance, find, dialog } = await setupDialog('MoveDialog', {
    move: async (id) => {
      calls.push(id);
      if (id === 'B' && !failed) {
        failed = true;
        throw Error('denied');
      }
    }
  });
  await instance.show(['A', 'B']);
  find('[data-id="F"]').click();
  await settle();
  await instance.confirm();
  assert.deepEqual(calls, ['A', 'B']);
  assert.deepEqual([...instance.currentIds], ['B']);
  assert.match(find('.dialog-status').textContent, /剩余 1 项/);
  await instance.confirm();
  assert.deepEqual(calls, ['A', 'B', 'B']);
  assert.equal(dialog.classList.contains('hidden'), true);
});

test('position reads cannot overwrite a newer target and selected folders exclude their descendants', async () => {
  const gate = deferred();
  const { instance, find, dialog } = await setupDialog('MoveDialog', {
    getFolderTree: async () => [
      {
        id: 'root',
        title: '书签栏',
        children: [{ id: 'F', title: 'F', children: [{ id: 'G', title: 'G' }] }]
      }
    ],
    getChildren: (id) => (id === 'F' ? gate.promise : Promise.resolve([{ id: 'S', title: 'S' }]))
  });
  await instance.show('A');
  find('[data-id="F"]').click();
  find('[data-id="root"]').click();
  await settle();
  gate.resolve([{ id: 'late', title: '旧位置' }]);
  await settle();
  assert.equal(instance.selectedTargetId, 'root');
  assert.equal(find('#move-position').value, 'last');
  assert.equal(dialog.querySelector('option[value="late"]'), null);
  await instance.show('F');
  assert.equal(find('[data-id="F"]'), null);
  assert.equal(find('[data-id="G"]'), null);
});
