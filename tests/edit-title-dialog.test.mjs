import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { setupDialog } from './helpers/dialog-harness.mjs';
import { deferred } from './helpers/grid-harness.mjs';

test('card rename opens the title dialog instead of editing card text', async () => {
  const source = await readFile(new URL('../components/BookmarkCard.js', import.meta.url), 'utf8');
  assert.match(source, /EventBus\.emit\('card:editTitle'/);
  assert.match(source, /e\.key === 'F2'[\s\S]*?this\.startEdit\(\)/);
  assert.match(source, /label: '重命名…',[\s\S]*?this\.startEdit\(\)/);
  assert.doesNotMatch(source, /addEventListener\('dblclick'/);
  assert.doesNotMatch(source, /contentEditable|contenteditable/);
});

test('rename dialog saves only a changed title and preserves cancel', async () => {
  const { instance: editor, find, dialog, trigger: card, writes } = await setupDialog('EditDialog');
  const titleInput = find('#edit-title');
  const urlInput = find('#edit-url');
  const dialogTitle = find('#edit-dialog-title');
  const confirmBtn = find('#edit-dialog-confirm');
  editor.showEditTitle({ id: 'bookmark-1', title: '旧标题', isFolder: false, returnFocus: card });
  assert.equal(dialogTitle.textContent, '编辑书签名称');
  assert.equal(confirmBtn.textContent, '保存');
  assert.equal(titleInput.value, '旧标题');
  assert.equal(titleInput.selected, true);
  assert.equal(urlInput.parentElement.style.display, 'none');
  assert.equal(dialog.classList.contains('hidden'), false);

  titleInput.value = '  新标题  ';
  await editor.confirm();
  assert.deepEqual(writes, [['update', 'bookmark-1', '新标题']]);
  assert.equal(dialog.classList.contains('hidden'), true);
  assert.equal(card.focusCount, 2);

  editor.showEditTitle({ id: 'folder-1', title: '文件夹', isFolder: true, returnFocus: card });
  assert.equal(dialogTitle.textContent, '编辑文件夹名称');
  titleInput.value = '未保存';
  editor.hide();
  assert.equal(writes.length, 1);
  editor.showEditTitle({ id: 'folder-1', title: '文件夹', isFolder: true, returnFocus: card });
  await editor.confirm();
  assert.equal(writes.length, 1);
  assert.equal(dialog.classList.contains('hidden'), true);
});

test('rename busy state prevents duplicate saves and a fixed status allows retry', async () => {
  const gate = deferred();
  const calls = [];
  const harness = await setupDialog('EditDialog', { update(id, title) { calls.push([id, title]); return gate.promise; } });
  const { instance: editor, find, dialog, store } = harness;
  editor.showEditTitle({ id: 'A', title: '旧名称' });
  const title = find('#edit-title'); const confirm = find('#edit-dialog-confirm'); const status = find('.dialog-status');
  title.value = '新名称';
  const saving = editor.confirm();
  await editor.confirm();
  assert.equal(calls.length, 1);
  assert.equal(confirm.disabled, true);
  assert.equal(confirm.getAttribute('aria-busy'), 'true');
  assert.equal(title.disabled, true);
  assert.equal(confirm.textContent, '保存');
  gate.reject(new Error('write denied'));
  await saving;
  assert.equal(dialog.classList.contains('hidden'), false);
  assert.equal(title.value, '新名称');
  assert.equal(title.disabled, false);
  assert.equal(status.classList.contains('error'), true);
  assert.match(status.textContent, /重试/);
  assert.equal(confirm.textContent, '保存');
  assert.equal(confirm.disabled, false);
  store.update = async () => {};
  await editor.confirm();
  assert.equal(dialog.classList.contains('hidden'), true);
});

test('a late rename completion leaves a newly opened dialog and its busy state intact', async () => {
  const first = deferred(); const second = deferred(); let call = 0;
  const { instance: editor, find, dialog } = await setupDialog('EditDialog', { update: () => (++call === 1 ? first.promise : second.promise) });
  editor.showEditTitle({ id: 'A', title: 'A' }); find('#edit-title').value = 'A1';
  const oldSave = editor.confirm();
  editor.hide(); editor.showEditTitle({ id: 'B', title: 'B' }); find('#edit-title').value = 'B1';
  const currentSave = editor.confirm();
  first.resolve(); await oldSave;
  assert.equal(dialog.classList.contains('hidden'), false);
  assert.equal(find('#edit-title').value, 'B1');
  assert.equal(find('#edit-dialog-confirm').disabled, true);
  second.resolve(); await currentSave;
  assert.equal(dialog.classList.contains('hidden'), true);
});

test('create validation uses the status area and preserves the existing event payload', async () => {
  const { instance: editor, find, dialog, events } = await setupDialog('EditDialog');
  editor.showNew();
  await editor.confirm();
  assert.equal(events.length, 0);
  assert.equal(find('#edit-title').getAttribute('aria-invalid'), 'true');
  find('#edit-title').value = '网址'; find('#edit-title').dispatch('input');
  find('#edit-url').value = 'https://';
  await editor.confirm();
  assert.equal(events.length, 0);
  assert.equal(find('#edit-url').getAttribute('aria-invalid'), 'true');
  assert.equal(find('#edit-dialog-confirm').textContent, '创建');
  find('#edit-url').value = 'example.test'; find('#edit-url').dispatch('input');
  await editor.confirm();
  assert.equal(events[0][0], 'bookmark:create');
  assert.equal(JSON.stringify(events[0][1]), JSON.stringify({ parentId: 'root', title: '网址', url: 'https://example.test/' }));
  assert.equal(dialog.classList.contains('hidden'), true);
  editor.showNewFolder(); find('#edit-title').value = '新文件夹'; await editor.confirm();
  assert.equal(events[1][0], 'folder:create');
  assert.equal(JSON.stringify(events[1][1]), JSON.stringify({ parentId: 'root', title: '新文件夹' }));
});
