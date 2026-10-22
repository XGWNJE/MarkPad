import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { containsRoundedPoint } from '../core/DropTargetGeometry.js';
import { Element } from './helpers/grid-harness.mjs';


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
  const windowListeners = new Map();
  const window = {
    innerWidth: 1000,
    matchMedia: () => ({ matches: false }),
    addEventListener(name, listener) { if (!windowListeners.has(name)) windowListeners.set(name, []); windowListeners.get(name).push(listener); },
    removeEventListener() {}
  };
  window.fire = (name, event) => { for (const listener of windowListeners.get(name) || []) listener({ target: document, ...event }); };
  const context = vm.createContext({
    document, window, EventBus, containsRoundedPoint,
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
  return { app, actualDeleteMessage: context.App.prototype._getDeleteConfirmMessage, bookmarkStore, deleteMessages, move, tree, folder, remove, dialog, cancel, confirm, message, retry, status, document, window, EventBus, emitted, start, event, advance, grid, menuTrigger };
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

test('valid deletion requests confirmation without directly deleting', async () => {
  const h=await setup(); h.start('A',true); h.remove.classList.add('visible');
  const event=h.event(h.remove,864,436); h.remove.fire('dragover',event);
  assert.equal(h.remove.classList.contains('over'),true); h.remove.fire('drop',event);
  assert.deepEqual(h.emitted.filter(([name])=>name==='card:requestDelete'),[['card:requestDelete',{id:'A',isFolder:true}]]);
  assert.equal(h.emitted.some(([name])=>name==='card:delete'),false);
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

test('the delete zone appears on the first edge dragover while the folder panel keeps its delay', async () => {
  const h = await setup();
  h.start();
  h.document.fire('dragover', h.event(h.document, 990, 436));
  assert.equal(h.remove.classList.contains('visible'), true);
  assert.equal(h.move.classList.contains('visible'), false);
  h.document.fire('dragover', h.event(h.document, 10, 436));
  h.advance(179);
  assert.equal(h.move.classList.contains('visible'), false);
  assert.equal(h.remove.classList.contains('visible'), false);
  h.advance(1);
  assert.equal(h.move.classList.contains('visible'), true);
  h.EventBus.emit('drag:sessionEnd');
  assert.equal(h.remove.classList.contains('visible'), false);
  assert.equal(h.move.classList.contains('visible'), false);
});

test('a drop whose hit test landed on a lower element still counts while the pointer is inside the zone', async () => {
  const h = await setup();
  h.app.grid.cards.set('A', { isFolder: true, data: { title: '待删除的文件夹' } });
  h.start('A', true);
  h.remove.classList.add('visible');
  const event = h.event(h.document, 864, 436);
  h.remove.fire('drop', event);
  assert.deepEqual(h.emitted.filter(([name]) => name === 'card:requestDelete'), [
    ['card:requestDelete', { id: 'A', isFolder: true }]
  ]);
  assert.equal(event.prevented, true);
});

test('a drag released inside the zone without a drop event still asks for confirmation once', async () => {
  const h = await setup();
  h.app.grid.cards.set('A', { isFolder: true, data: { title: '待删除的文件夹' } });
  h.start('A', true);
  h.remove.classList.add('visible');
  h.remove.fire('dragover', h.event(h.remove, 864, 436));
  h.document.fire('dragend', h.event(h.document, 864, 436));
  assert.deepEqual(h.emitted.filter(([name]) => name === 'card:requestDelete'), [
    ['card:requestDelete', { id: 'A', isFolder: true }]
  ]);
  h.document.fire('dragend', h.event(h.document, 864, 436));
  assert.equal(h.emitted.filter(([name]) => name === 'card:requestDelete').length, 1);
});

test('a drag that leaves the zone before release never asks for deletion through the dragend fallback', async () => {
  const h = await setup();
  h.start();
  h.remove.classList.add('visible');
  h.remove.fire('dragover', h.event(h.remove, 864, 436));
  h.document.fire('dragover', h.event(h.document, 400, 436));
  h.document.fire('dragend', h.event(h.document, 400, 436));
  assert.equal(h.emitted.some(([name]) => name === 'card:requestDelete'), false);
});

test('a drag canceled with Escape never asks for deletion through the dragend fallback', async () => {
  const h = await setup();
  h.start();
  h.remove.classList.add('visible');
  h.remove.fire('dragover', h.event(h.remove, 864, 436));
  h.document.fire('keydown', { key: 'Escape' });
  h.document.fire('dragend', h.event(h.document, 864, 436));
  assert.equal(h.emitted.some(([name]) => name === 'card:requestDelete'), false);
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
