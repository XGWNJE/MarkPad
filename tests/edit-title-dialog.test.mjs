import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('card rename opens the title dialog instead of editing card text', async () => {
  const source = await readFile(new URL('../components/BookmarkCard.js', import.meta.url), 'utf8');
  assert.match(source, /EventBus\.emit\('card:editTitle'/);
  assert.match(source, /e\.key === 'F2'[\s\S]*?this\.startEdit\(\)/);
  assert.match(source, /label: '编辑名称',[\s\S]*?this\.startEdit\(\)/);
  assert.doesNotMatch(source, /addEventListener\('dblclick'/);
  assert.doesNotMatch(source, /contentEditable|contenteditable/);
});

test('rename dialog saves only a changed title and preserves cancel', async () => {
  const updateCalls = [];
  const event = { addListener() {} };
  globalThis.chrome = {
    bookmarks: {
      onCreated: event,
      onRemoved: event,
      onChanged: event,
      onMoved: event,
      onChildrenReordered: event,
      update: async (...args) => {
        updateCalls.push(args);
        return { id: args[0], ...args[1] };
      }
    }
  };

  const classNames = new Set(['hidden']);
  const dialog = {
    classList: {
      add(name) { classNames.add(name); },
      remove(name) { classNames.delete(name); },
      contains(name) { return classNames.has(name); }
    },
    querySelectorAll() { return []; },
    querySelector() { return { addEventListener() {} }; }
  };
  const titleInput = {
    value: '',
    focusCount: 0,
    selected: false,
    addEventListener() {},
    focus() { this.focusCount++; },
    select() { this.selected = true; },
    setCustomValidity() {},
    reportValidity() {}
  };
  const urlInput = { parentElement: { style: { display: 'block' } } };
  const dialogTitle = { textContent: '' };
  const confirmBtn = { textContent: '', addEventListener() {} };
  const elements = new Map([
    ['edit-dialog', dialog],
    ['edit-title', titleInput],
    ['edit-url', urlInput],
    ['edit-dialog-title', dialogTitle],
    ['edit-dialog-confirm', confirmBtn]
  ]);
  globalThis.document = {
    getElementById(id) { return elements.get(id); },
    addEventListener() {}
  };
  globalThis.history = { replaceState() {} };
  globalThis.location = { href: 'chrome-extension://test/index.html' };
  globalThis.window = { addEventListener() {} };

  const [{ default: EditDialog }, { default: EventBus }] = await Promise.all([
    import('../components/EditDialog.js'),
    import('../core/EventBus.js')
  ]);
  const editor = new EditDialog();
  const card = { isConnected: true, focusCount: 0, focus() { this.focusCount++; } };

  EventBus.emit('card:editTitle', { id: 'bookmark-1', title: '旧标题', isFolder: false, returnFocus: card });
  assert.equal(dialogTitle.textContent, '编辑书签名称');
  assert.equal(confirmBtn.textContent, '保存');
  assert.equal(titleInput.value, '旧标题');
  assert.equal(titleInput.selected, true);
  assert.equal(urlInput.parentElement.style.display, 'none');
  assert.equal(classNames.has('hidden'), false);

  titleInput.value = '  新标题  ';
  await editor.confirm();
  assert.deepEqual(updateCalls, [['bookmark-1', { title: '新标题' }]]);
  assert.equal(classNames.has('hidden'), true);
  assert.equal(card.focusCount, 1);

  EventBus.emit('card:editTitle', { id: 'folder-1', title: '文件夹', isFolder: true, returnFocus: card });
  assert.equal(dialogTitle.textContent, '编辑文件夹名称');
  titleInput.value = '未保存';
  editor.hide();
  assert.equal(updateCalls.length, 1);
});
