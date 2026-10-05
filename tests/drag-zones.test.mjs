import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { containsRoundedPoint } from '../core/DropTargetGeometry.js';
import { Element } from './helpers/grid-harness.mjs';
import { deferred } from './helpers/grid-harness.mjs';

const settle = () => new Promise(resolve => setImmediate(resolve));

class PanelElement extends Element {
  closest(selector) {
    for (let node = this; node; node = node.parentElement) {
      if (selector.startsWith('.') && node.classList.contains(selector.slice(1))) return node;
    }
    return null;
  }
  getBoundingClientRect() { return this.rect; }
  fire(name, event) { for (const listener of this.listeners.get(name) || []) listener(event); }
  prepend(child) { this.insertBefore(child, this.firstChild); }
  click() { if (!this.disabled) super.click(); }
}

async function setup() {
  const elements = new Map();
  const make = id => { const element = new PanelElement(); element.id = id; elements.set(id, element); return element; };
  const move = make('drag-move-panel');
  move.rect = { left: 16, top: 88, right: 276, bottom: 784 };
  const tree = make('drag-folder-tree');
  tree.rect = { left: 17, top: 140, right: 275, bottom: 783 };
  move.appendChild(tree);
  const folder = new PanelElement();
  folder.className = 'drag-folder-item';
  folder.dataset.id = 'F';
  tree.appendChild(folder);
  const remove = make('drag-delete-zone');
  remove.rect = { left: 744, top: 88, right: 984, bottom: 784 };
  const dialog = make('delete-confirm-dialog');
  dialog.classList.add('hidden');
  const cancel = new PanelElement();
  const overlay = new PanelElement();
  const heading = new PanelElement('h3');
  const footer = new PanelElement();
  dialog.querySelector = selector => selector === '.dialog-overlay' ? overlay : selector === '.dialog-footer' ? footer : selector === '.dialog-header h3' ? heading : cancel;
  dialog.querySelectorAll = () => [cancel];
  const confirm = make('delete-confirm-btn');
  const message = make('delete-confirm-message');
  footer.append(cancel, confirm);
  const menuTrigger = make('menu-trigger');
  menuTrigger.connected = true;

  const document = new PanelElement();
  document.getElementById = id => elements.get(id);
  document.createElement = () => new PanelElement();
  const grid = new PanelElement();
  grid.connected = true;
  document.querySelectorAll = selector => selector === '#bookmark-grid > .bookmark-card, #bookmark-grid > .grid-create-card'
    ? grid.children.filter(child => child.classList.contains('bookmark-card') || child.classList.contains('grid-create-card')) : [];
  const handlers = new Map();
  const emitted = [];
  const EventBus = {
    on(name, listener) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(listener);
    },
    emit(name, payload) {
      emitted.push([name, structuredClone(payload)]);
      for (const listener of handlers.get(name) || []) listener(payload);
    }
  };
  let now = 0;
  let sequence = 0;
  const timers = new Map();
  const setTimeout = (callback, delay) => {
    const id = ++sequence;
    timers.set(id, { callback, at: now + delay });
    return id;
  };
  const clearTimeout = id => timers.delete(id);
  const advance = amount => {
    now += amount;
    for (const [id, timer] of [...timers]) {
      if (timer.at <= now) { timers.delete(id); timer.callback(); }
    }
  };
  const bookmarkStore = { getNode: async id => ({ id, title: '当前文件夹', children: [] }), countDescendants: () => 11 };
  const context = vm.createContext({
    document, window: { innerWidth: 1000 }, EventBus, containsRoundedPoint,
    BookmarkStore: bookmarkStore,
    getComputedStyle: element => ({ display: 'flex', visibility: 'visible', opacity: element.opacity ?? '1', borderTopLeftRadius: '18px' }),
    setTimeout, clearTimeout,
    requestAnimationFrame: callback => setTimeout(callback, 16), cancelAnimationFrame: clearTimeout
  });
  const source = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, '')
    .replace(/new App\(\);\s*$/, 'globalThis.App = App;'), context);
  const app = Object.create(context.App.prototype);
  app.grid = { cards: new Map() };
  const deleteMessages = [];
  app._getDeleteConfirmMessage = async (...args) => { deleteMessages.push(args); return '确认删除'; };
  app.bindDragZones();
  const start = (id = 'A', isFolder = false) => EventBus.emit('card:dragstart', { id, isFolder });
  const event = (target, x, y, id = 'A') => ({
    target, clientX: x, clientY: y,
    dataTransfer: { dropEffect: 'none', getData: () => id },
    preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }
  });
  const status = footer.children[0];
  const retry = footer.children.find(child => child.textContent === '重试');
  return { app, actualDeleteMessage: context.App.prototype._getDeleteConfirmMessage, bookmarkStore, deleteMessages, move, tree, folder, remove, dialog, cancel, confirm, message, retry, status, document, EventBus, emitted, start, event, advance, grid, menuTrigger };
}

test('delete requires the visible rounded surface, excluding margins and clipped corners', async () => {
  const h = await setup();
  for (const [x, y] of [[990, 436], [864, 80], [864, 790], [745, 89], [983, 783]]) {
    h.start();
    h.remove.classList.add('visible');
    const event = h.event(h.remove, x, y);
    h.remove.fire('dragover', event);
    assert.equal(h.remove.classList.contains('over'), false);
    assert.equal(event.dataTransfer.dropEffect, 'none');
    h.remove.fire('drop', event);
  }
  assert.equal(h.emitted.some(([name]) => name === 'card:requestDelete'), false);
});

test('valid deletion still opens confirmation and only its confirm button deletes', async () => {
  const h = await setup();
  h.app.grid.cards.set('A', { data: { title: '待删除的文件夹' } });
  h.start('A', true);
  h.remove.classList.add('visible');
  const event = h.event(h.remove, 864, 436);
  h.remove.fire('dragover', event);
  assert.equal(h.remove.classList.contains('over'), true);
  h.remove.fire('drop', event);
  assert.deepEqual(h.emitted.filter(([name]) => name === 'card:requestDelete'), [
    ['card:requestDelete', { id: 'A', isFolder: true }]
  ]);
  assert.equal(h.dialog.classList.contains('hidden'), false);
  assert.equal(h.cancel.focusCount, 1);
  assert.deepEqual(h.deleteMessages, [['A', true, '待删除的文件夹']]);
  assert.equal(h.emitted.some(([name]) => name === 'card:delete'), false);
  assert.equal(h.confirm.disabled, true);
  await settle();
  h.confirm.click();
  assert.deepEqual(h.emitted.filter(([name]) => name === 'card:delete'), [
    ['card:delete', { id: 'A', isFolder: true }]
  ]);
});

test('delete confirmation cannot submit before folder information is available', async () => {
  const h = await setup(); const gate = deferred();
  h.app._getDeleteConfirmMessage = () => gate.promise;
  h.EventBus.emit('card:requestDelete', { id: 'F', isFolder: true });
  assert.equal(h.dialog.getAttribute('role'), 'dialog');
  assert.equal(h.dialog.getAttribute('aria-modal'), 'true');
  assert.equal(h.dialog.getAttribute('aria-labelledby'), 'delete-confirm-title');
  assert.equal(h.confirm.disabled, true);
  assert.equal(h.confirm.getAttribute('aria-busy'), 'true');
  h.confirm.fire('click', {});
  assert.equal(h.emitted.some(([name]) => name === 'card:delete'), false);
  assert.equal(h.dialog.classList.contains('hidden'), false);
  gate.resolve('包含 11 个子项，会一并删除。'); await settle();
  assert.equal(h.confirm.disabled, false);
  assert.equal(h.confirm.getAttribute('aria-busy'), 'false');
  assert.match(h.message.textContent, /11/);
  h.confirm.click();
  assert.deepEqual(h.emitted.filter(([name]) => name === 'card:delete'), [['card:delete', { id: 'F', isFolder: true }]]);
});

test('folder read failure keeps deletion unavailable and exposes a successful retry', async () => {
  const h = await setup(); let failed = true;
  h.app._getDeleteConfirmMessage = async () => { if (failed) throw new Error('read denied'); return '已读取的文件夹风险提示'; };
  h.EventBus.emit('card:requestDelete', { id: 'F', isFolder: true }); await settle();
  assert.equal(h.confirm.disabled, true);
  assert.equal(h.status.classList.contains('error'), true);
  assert.equal(h.retry.classList.contains('hidden'), false);
  h.confirm.fire('click', {});
  assert.equal(h.emitted.some(([name]) => name === 'card:delete'), false);
  failed = false; h.retry.click();
  assert.equal(h.confirm.disabled, true);
  await settle();
  assert.equal(h.confirm.disabled, false);
  assert.equal(h.retry.classList.contains('hidden'), true);
  assert.equal(h.status.classList.contains('error'), false);
  h.confirm.click();
  assert.equal(h.emitted.filter(([name]) => name === 'card:delete').length, 1);
});

test('closing deletion while reading invalidates late results and a new request stays locked', async () => {
  const h = await setup(); const old = deferred(); const current = deferred(); let call = 0;
  h.app._getDeleteConfirmMessage = () => (++call === 1 ? old.promise : current.promise);
  h.EventBus.emit('card:requestDelete', { id: 'F', isFolder: true });
  h.app.hideDeleteConfirmation();
  h.EventBus.emit('card:requestDelete', { id: 'G', isFolder: true });
  old.resolve('旧风险信息'); await settle();
  assert.equal(h.confirm.disabled, true);
  assert.equal(h.message.textContent, '正在读取书签信息…');
  current.resolve('新风险信息'); await settle();
  assert.equal(h.confirm.disabled, false);
  assert.equal(h.message.textContent, '新风险信息');
  h.cancel.click();
  assert.equal(h.dialog.classList.contains('hidden'), true);
  assert.equal(h.emitted.some(([name]) => name === 'card:delete'), false);
});

test('folder confirmation requires a real readable folder and uses its current title', async () => {
  const h = await setup();
  assert.match(await h.actualDeleteMessage.call(h.app, 'F', true, '旧标题'), /当前文件夹.*11/);
  h.bookmarkStore.getNode = async () => null;
  await assert.rejects(h.actualDeleteMessage.call(h.app, 'missing', true), /no longer exists/);
  h.bookmarkStore.getNode = async () => { throw new Error('tree unavailable'); };
  await assert.rejects(h.actualDeleteMessage.call(h.app, 'F', true), /tree unavailable/);
});

function addGridCard(h, id, className = 'bookmark-card') {
  const element = new PanelElement();
  element.className = className;
  element.dataset.id = id;
  const focus = element.focus.bind(element);
  element.focus = () => { focus(); h.document.activeElement = element; };
  h.grid.appendChild(element);
  if (className === 'bookmark-card') h.app.grid.cards.set(id, { element, data: { title: id } });
  return element;
}

test('confirmed deletion chooses the next DOM item before a synchronous delete listener removes the source', async () => {
  const h = await setup();
  const previous = addGridCard(h, 'A');
  const source = addGridCard(h, 'B');
  const next = addGridCard(h, 'create', 'grid-create-card');
  h.EventBus.on('card:delete', () => { source.remove(); h.app.grid.cards.delete('B'); });
  h.EventBus.emit('card:requestDelete', { id: 'B', isFolder: false }); await settle();
  h.confirm.click();
  assert.equal(h.document.activeElement, next);
  assert.equal(next.focusCount, 1);
  assert.equal(previous.focusCount || 0, 0);
  assert.equal(source.focusCount || 0, 0);
  assert.equal(h.menuTrigger.focusCount || 0, 0);
  assert.deepEqual(h.emitted.filter(([name]) => name === 'card:delete'), [['card:delete', { id: 'B', isFolder: false }]]);
});

test('confirmed deletion focuses the previous item at the end and stays there when the source is later destroyed', async () => {
  const h = await setup();
  const previous = addGridCard(h, 'A');
  const source = addGridCard(h, 'B');
  h.EventBus.emit('card:requestDelete', { id: 'B', isFolder: false }); await settle();
  h.confirm.click();
  assert.equal(h.document.activeElement, previous);
  source.remove();
  assert.equal(h.document.activeElement, previous);
  assert.equal(source.focusCount || 0, 0);
});

test('confirmed deletion falls back to settings when no neighboring item exists', async () => {
  const h = await setup();
  const source = addGridCard(h, 'A');
  h.EventBus.emit('card:requestDelete', { id: 'A', isFolder: false }); await settle();
  h.confirm.click();
  assert.equal(h.menuTrigger.focusCount, 1);
  assert.equal(source.focusCount || 0, 0);
});

test('canceling deletion restores the original card without choosing its neighbor', async () => {
  const h = await setup();
  const source = addGridCard(h, 'A');
  const next = addGridCard(h, 'B');
  h.EventBus.emit('card:requestDelete', { id: 'A', isFolder: false }); await settle();
  h.cancel.click();
  assert.equal(h.document.activeElement, source);
  assert.equal(source.focusCount, 1);
  assert.equal(next.focusCount || 0, 0);
  assert.equal(h.emitted.some(([name]) => name === 'card:delete'), false);
});

test('move uses the same painted boundary while preserving the folder event contract', async () => {
  const h = await setup();
  for (const [x, y] of [[8, 170], [20, 89], [280, 170]]) {
    h.start();
    h.move.classList.add('visible');
    h.tree.fire('drop', h.event(h.folder, x, y));
  }
  assert.equal(h.emitted.some(([name]) => name === 'card:drop'), false);
  h.start();
  h.move.classList.add('visible');
  h.tree.fire('drop', h.event(h.folder, 100, 170));
  assert.deepEqual(h.emitted.filter(([name]) => name === 'card:drop'), [
    ['card:drop', { draggedId: 'A', targetId: 'F', action: 'into' }]
  ]);
});

test('24px exit buffer keeps a panel open but never enlarges its accepted drop area', async () => {
  const h = await setup();
  h.start();
  h.remove.classList.add('visible');
  h.document.fire('dragover', h.event(h.document, 990, 436));
  assert.equal(h.remove.classList.contains('visible'), true);
  h.remove.fire('drop', h.event(h.remove, 990, 436));
  assert.equal(h.emitted.some(([name]) => name === 'card:requestDelete'), false);
});

test('edge activation retains its 180ms delay and cancellation clears both panels', async () => {
  const h = await setup();
  h.start();
  h.document.fire('dragover', h.event(h.document, 990, 436));
  h.advance(179);
  assert.equal(h.remove.classList.contains('visible'), false);
  h.advance(1);
  assert.equal(h.remove.classList.contains('visible'), true);
  h.EventBus.emit('drag:sessionEnd');
  assert.equal(h.remove.classList.contains('visible'), false);
  assert.equal(h.move.classList.contains('visible'), false);
});

test('hidden, transparent, stale-source, and canceled panels cannot request deletion', async () => {
  const h = await setup();
  h.start();
  h.remove.fire('drop', h.event(h.remove, 864, 436));
  h.start();
  h.remove.classList.add('visible');
  h.remove.opacity = '0';
  h.remove.fire('drop', h.event(h.remove, 864, 436));
  h.remove.opacity = '1';
  h.start();
  h.remove.classList.add('visible');
  h.remove.fire('drop', h.event(h.remove, 864, 436, 'old-source'));
  h.EventBus.emit('drag:sessionEnd');
  h.remove.classList.add('visible');
  h.remove.fire('drop', h.event(h.remove, 864, 436));
  assert.equal(h.emitted.some(([name]) => name === 'card:requestDelete'), false);
});
