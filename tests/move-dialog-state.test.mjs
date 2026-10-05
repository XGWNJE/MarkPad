import assert from 'node:assert/strict';
import test from 'node:test';
import { setupDialog } from './helpers/dialog-harness.mjs';
import { deferred } from './helpers/grid-harness.mjs';

test('move target loading failure uses a stable status and a new opening can retry', async () => {
  const { instance, find, store } = await setupDialog('MoveDialog', { getFolderTree: async () => { throw new Error('read denied'); } });
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
  const gate = deferred(); const calls = [];
  const { instance, find, dialog, store, trigger } = await setupDialog('MoveDialog', { move(...args) { calls.push(args); return gate.promise; } });
  await instance.show('A', trigger);
  const target = dialog.querySelectorAll('.folder-tree-item')[1]; target.click();
  const confirm = find('#move-dialog-confirm');
  const moving = instance.confirm(); await instance.confirm();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ['A', 'F']);
  assert.equal(confirm.disabled, true);
  assert.equal(confirm.getAttribute('aria-busy'), 'true');
  assert.equal(target.disabled, true);
  gate.reject(new Error('move denied')); await moving;
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
  const first = deferred(); const second = deferred(); let call = 0;
  const { instance, find, dialog } = await setupDialog('MoveDialog', { move: () => (++call === 1 ? first.promise : second.promise) });
  await instance.show('A'); find('[data-id="F"]').click(); const oldMove = instance.confirm();
  instance.hide(); await instance.show('B'); find('[data-id="F"]').click(); const currentMove = instance.confirm();
  first.resolve(); await oldMove;
  assert.equal(dialog.classList.contains('hidden'), false);
  assert.equal(find('#move-dialog-confirm').disabled, true);
  assert.equal(find('#move-dialog-confirm').getAttribute('aria-busy'), 'true');
  second.resolve(); await currentMove;
  assert.equal(dialog.classList.contains('hidden'), true);
});

test('the current parent is shown but cannot implicitly move a bookmark to its own end', async () => {
  const { instance, find, writes, document } = await setupDialog('MoveDialog');
  await instance.show('A');
  const current = find('[data-id="root"]'); const other = find('[data-id="F"]');
  assert.equal(current.disabled, true);
  assert.equal(current.getAttribute('aria-disabled'), 'true');
  assert.match(current.textContent, /当前位置/);
  assert.equal(other.disabled, false);
  assert.equal(document.activeElement, other);
  current.click();
  assert.equal(instance.selectedTargetId, null);
  assert.equal(find('#move-dialog-confirm').disabled, true);
  instance.selectedTargetId = 'root';
  await instance.confirm();
  assert.equal(writes.length, 0, 'confirm independently rejects the current parent');
  other.click(); await instance.confirm();
  assert.deepEqual(writes, [['move', 'A', 'F']]);
});

test('a failed move never re-enables the current parent and a missing source cannot move', async () => {
  const { instance, find, store } = await setupDialog('MoveDialog', { move: async () => { throw new Error('move denied'); } });
  await instance.show('A'); find('[data-id="F"]').click(); await instance.confirm();
  assert.equal(find('[data-id="root"]').disabled, true);
  assert.equal(find('[data-id="F"]').disabled, false);
  store.getNode = async () => null;
  await instance.show('missing');
  assert.equal(find('#move-dialog-confirm').disabled, true);
  assert.equal(find('.dialog-status').classList.contains('error'), true);
  assert.equal(find('.folder-tree-item'), null);
});
