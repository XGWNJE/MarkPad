import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import { getPreviewOrder, hitTestSlots } from '../core/DragOrder.js';
import { Element, deferred } from './helpers/grid-harness.mjs';

class FakeClock {
  constructor() { this.now = 0; this.nextId = 1; this.tasks = new Map(); }
  setTimeout(callback, delay = 0) {
    const id = this.nextId++;
    this.tasks.set(id, { callback, at: this.now + Math.max(0, delay) });
    return id;
  }
  clearTimeout(id) { this.tasks.delete(id); }
  advance(duration) {
    const until = this.now + duration;
    while (true) {
      const next = [...this.tasks].filter(([, task]) => task.at <= until)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      this.tasks.delete(next[0]);
      this.now = next[1].at;
      next[1].callback(this.now);
    }
    this.now = until;
  }
}

class DragElement extends Element {
  constructor(clock) { super(); this.clock = clock; this.animationCalls = []; }
  closest(selectors) {
    for (let element = this; element; element = element.parentElement) {
      if (selectors.split(',').some(selector => {
        const value = selector.trim();
        return value.startsWith('.') ? element.classList.contains(value.slice(1)) : value === `#${element.id}`;
      })) return element;
    }
    return null;
  }
  getBoundingClientRect() {
    const base = this.rect || { left: 0, top: 0, width: 0, height: 0 };
    const translation = this.style.transform?.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
    const left = base.left + (translation ? Number(translation[1]) : 0) + (this.slot ? this.parentElement.rect.left : 0);
    const top = base.top + (translation ? Number(translation[2]) : 0) + (this.slot ? this.parentElement.rect.top : 0);
    return { left, top, width: base.width, height: base.height, right: left + base.width, bottom: top + base.height };
  }
  animate(keyframes, options) {
    const completion = deferred();
    const timer = this.clock.setTimeout(() => completion.resolve(), options.duration);
    const animation = {
      keyframes, options, finished: completion.promise,
      cancel: () => { this.clock.clearTimeout(timer); completion.reject(new Error('Animation cancelled')); }
    };
    this.animationCalls.push(animation);
    return animation;
  }
  fire(name, event = {}) {
    return Promise.all([...this.listeners.get(name) || []].map(listener => listener({ target: this, ...event })));
  }
}

async function setup({ reducedMotion = false, move = async () => true } = {}) {
  const clock = new FakeClock();
  const body = new DragElement(clock);
  body.connected = true;
  const grid = new DragElement(clock);
  grid.rect = { left: 0, top: 0, width: 540, height: 120 };
  body.appendChild(grid);
  const document = new DragElement(clock);
  document.body = body;
  document.hidden = false;
  document.createElement = () => new DragElement(clock);
  const windowEvents = new DragElement(clock);
  const window = {
    matchMedia: () => ({ matches: reducedMotion }),
    addEventListener: (...args) => windowEvents.addEventListener(...args)
  };
  const listeners = new Map();
  const emitted = [];
  const EventBus = {
    on(name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    },
    emit(name, payload) {
      emitted.push([name, payload]);
      for (const listener of listeners.get(name) || []) listener(payload);
    }
  };
  const cards = new Map(['A', 'B', 'F', 'C'].map((id, index) => {
    const element = new DragElement(clock);
    element.slot = true;
    element.rect = { left: index * 140, top: 0, width: 120, height: 120 };
    element.dataset.id = id;
    element.className = 'bookmark-card';
    grid.appendChild(element);
    const card = { element, isFolder: id === 'F', paused: false, pauses: [],
      setInteractionPaused(value) { this.paused = value; this.pauses.push(value); } };
    return [id, card];
  }));
  const moves = [];
  const owner = {
    grid, cards, isLoading: false,
    moveCard: payload => { moves.push(structuredClone(payload)); return move(payload); }
  };
  const source = await readFile(new URL('../components/GridDragController.js', import.meta.url), 'utf8');
  const context = vm.createContext({
    EventBus, document, window, getPreviewOrder, hitTestSlots, queueMicrotask,
    getComputedStyle: () => ({ getPropertyValue: key => ({
      '--card-motion-duration': '180ms', '--card-motion-ease': 'cubic-bezier(0.2, 0, 0, 1)'
    }[key] || '') }),
    setTimeout: clock.setTimeout.bind(clock), clearTimeout: clock.clearTimeout.bind(clock),
    requestAnimationFrame: callback => clock.setTimeout(callback, 16),
    cancelAnimationFrame: clock.clearTimeout.bind(clock)
  });
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, '')
    .replace('export default class GridDragController', 'class GridDragController')
    + '\nglobalThis.GridDragController = GridDragController;', context);
  const controller = new context.GridDragController(owner);
  const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  const advance = async duration => { clock.advance(duration); await flush(); };
  const event = (id, fraction = 0.5, extra = {}) => {
    const rect = cards.get(id).element.rect;
    return {
      target: grid, clientX: rect.left + grid.rect.left + rect.width * fraction,
      clientY: rect.top + grid.rect.top + rect.height / 2, prevented: false,
      preventDefault() { this.prevented = true; },
      dataTransfer: { dropEffect: '', getData: () => controller.session?.id || 'A' }, ...extra
    };
  };
  const begin = (id = 'A') => {
    cards.get(id)?.element.classList.add('is-dragging');
    EventBus.emit('card:dragstart', { id });
  };
  const overlays = selector => body.querySelectorAll(selector);
  const assertCleared = () => {
    assert.equal(controller.session, null);
    assert.equal(grid.classList.contains('drag-active'), false);
    assert.equal(overlays('.grid-drop-placeholder').length, 0);
    assert.equal(overlays('.grid-drop-label').length, 0);
    for (const card of cards.values()) {
      for (const name of ['is-dragging', 'drop-pending', 'drop-into']) assert.equal(card.element.classList.contains(name), false);
    }
  };
  const assertIdle = () => {
    assertCleared();
    assert.equal(controller.animations.size, 0);
    assert.equal(controller.saving, false);
    for (const card of cards.values()) {
      assert.equal(card.paused, false);
      assert.equal(card.element.style.transform || '', '');
    }
  };
  return { controller, clock, owner, cards, grid, document, windowEvents, EventBus, emitted,
    moves, event, begin, advance, flush, overlays, assertCleared, assertIdle };
}

test('fixed slots keep the target stable while neighbors preview a new order and the drag source stays put', async () => {
  const h = await setup();
  h.begin();
  await h.document.fire('dragover', h.event('C', 0.9));
  await h.advance(16);
  assert.equal(h.cards.get('A').element.style.transform || '', '');
  for (const id of ['B', 'F', 'C']) assert.equal(h.cards.get(id).element.style.transform, 'translate(-140px, 0px)');
  assert.deepEqual(h.grid.children.map(element => element.dataset.id), ['A', 'B', 'F', 'C'], 'preview must not reorder the native drag source DOM');
  assert.equal(h.overlays('.grid-drop-placeholder')[0].style.left, '420px');
  const placeholder = h.controller.placeholder;
  assert.equal(h.cards.get('C').element.getBoundingClientRect().left, 280, 'fake geometry must reflect the visual translation');
  await h.document.fire('dragover', h.event('C', 0.9));
  await h.advance(16);
  assert.equal(h.controller.session.candidate.targetId, 'C');
  assert.equal(h.controller.session.candidate.action, 'after');
  assert.equal(h.controller.placeholder, placeholder, 'a stable candidate should reuse its placeholder');
  h.controller.cancel();
  await h.advance(180);
  h.assertIdle();
});

test('folder center needs a continuous 350 ms dwell before into becomes available', async () => {
  const h = await setup();
  h.begin();
  await h.document.fire('dragover', h.event('F'));
  await h.advance(349);
  assert.equal(h.cards.get('F').element.classList.contains('drop-pending'), true);
  assert.notEqual(h.controller.session.candidate.action, 'into');
  assert.equal(h.overlays('.grid-drop-placeholder').length, 0);
  assert.equal(h.overlays('.grid-drop-label')[0].textContent, '停留后移入文件夹');
  await h.advance(1);
  assert.equal(h.cards.get('F').element.classList.contains('drop-into'), true);
  assert.equal(h.controller.session.candidate.action, 'into');
  assert.equal(h.overlays('.grid-drop-label')[0].textContent, '移入文件夹');
  await h.document.fire('drop', h.event('F'));
  await h.advance(180);
  assert.deepEqual(h.moves, [{ draggedId: 'A', targetId: 'F', action: 'into' }]);
  h.assertIdle();
});

test('a creation card on the next row resolves to the last bookmark slot without entering the sortable cards', async () => {
  const h = await setup();
  const creation = new DragElement(h.clock);
  creation.className = 'grid-create-card';
  creation.slot = true;
  creation.rect = { left: 0, top: 140, width: 120, height: 120 };
  h.grid.rect.height = 260;
  h.grid.appendChild(creation);
  h.begin();
  const event = h.event('C', 0.9, { target: creation, clientX: 60, clientY: 200 });
  await h.document.fire('dragover', event);
  await h.advance(16);
  assert.deepEqual(Array.from(h.controller.session.ids), ['A', 'B', 'F', 'C']);
  assert.equal(h.controller.session.candidate.targetId, 'C');
  assert.equal(h.controller.session.candidate.action, 'after');
  assert.equal(creation.style.transform || '', '');
  assert.equal(h.cards.get('A').element.style.transform || '', '');
  await h.document.fire('drop', event);
  await h.advance(180);
  assert.deepEqual(h.moves, [{ draggedId: 'A', targetId: 'C', action: 'after' }]);
  assert.equal(h.grid.children.at(-1), creation);
  h.assertIdle();
});

test('dropping in a folder center before its dwell finishes cancels without a move', async () => {
  const h = await setup();
  h.begin();
  await h.document.fire('dragover', h.event('F'));
  await h.advance(349);
  await h.document.fire('drop', h.event('F'));
  await h.advance(1000);
  assert.equal(h.moves.length, 0);
  h.assertIdle();
});

test('crossing a folder center then leaving revokes its dwell and restores the insertion preview', async () => {
  const h = await setup();
  h.begin();
  await h.document.fire('dragover', h.event('F'));
  await h.advance(200);
  await h.document.fire('dragover', h.event('F', 0.9));
  await h.advance(200);
  assert.equal(h.cards.get('F').element.classList.contains('drop-pending'), false);
  assert.equal(h.cards.get('F').element.classList.contains('drop-into'), false);
  assert.equal(h.overlays('.grid-drop-label').length, 0);
  assert.equal(h.controller.session.candidate.action, 'after');
  assert.equal(h.overlays('.grid-drop-placeholder').length, 1);
  await h.document.fire('drop', h.event('F', 0.9));
  await h.advance(180);
  assert.deepEqual(h.moves, [{ draggedId: 'A', targetId: 'F', action: 'after' }]);
  h.assertIdle();
});

test('leaving a ready folder center clears into and requires a fresh full dwell on reentry', async () => {
  const h = await setup();
  h.begin();
  await h.document.fire('dragover', h.event('F'));
  await h.advance(350);
  await h.document.fire('dragover', h.event('F', 0.05));
  await h.advance(16);
  assert.equal(h.cards.get('F').element.classList.contains('drop-into'), false);
  await h.document.fire('dragover', h.event('F'));
  await h.advance(349);
  assert.notEqual(h.controller.session.candidate.action, 'into');
  await h.document.fire('drop', h.event('F'));
  await h.advance(500);
  assert.equal(h.moves.length, 0);
  h.assertIdle();
});

test('drop rechecks current coordinates and invokes one move even if drop arrives twice', async () => {
  const gate = deferred();
  const h = await setup({ move: () => gate.promise });
  h.begin();
  await h.document.fire('dragover', h.event('C', 0.9));
  await h.advance(16);
  const first = h.document.fire('drop', h.event('B', 0.1));
  await h.flush();
  assert.equal(h.controller.saving, true);
  assert.deepEqual(h.moves, [{ draggedId: 'A', targetId: 'B', action: 'before' }]);
  await h.document.fire('drop', h.event('C', 0.9));
  assert.equal(h.moves.length, 1);
  h.assertCleared();
  gate.resolve(true);
  await first;
  await h.advance(180);
  h.assertIdle();
});

for (const phase of ['insertion', 'pending folder']) {
  for (const end of ['cancel', 'card:dragend', 'dragend', 'Escape', 'blur', 'visibilitychange', 'resize']) {
    test(`${end} clears an active ${phase} session and returns every card to idle`, async () => {
      const h = await setup();
      h.begin();
      await h.document.fire('dragover', h.event('C', 0.9));
      await h.advance(16);
      if (phase === 'pending folder') {
        await h.document.fire('dragover', h.event('F'));
        await h.advance(16);
        assert.equal(h.overlays('.grid-drop-label').length, 1);
      } else {
        assert.equal(h.overlays('.grid-drop-placeholder').length, 1);
      }
      if (end === 'cancel') h.controller.cancel();
      else if (end === 'card:dragend') h.EventBus.emit(end, { id: 'A' });
      else if (end === 'blur' || end === 'resize') await h.windowEvents.fire(end);
      else if (end === 'Escape') await h.document.fire('keydown', { key: 'Escape' });
      else {
        if (end === 'visibilitychange') h.document.hidden = true;
        await h.document.fire(end);
      }
      h.assertCleared();
      await h.advance(1000);
      assert.equal(h.moves.length, 0);
      h.assertIdle();
    });
  }
}

for (const kind of ['no session', 'external payload', 'outside grid', 'source slot', 'side panel']) {
  test(`${kind} drops cannot write bookmarks`, async () => {
    const h = await setup();
    if (kind !== 'no session') {
      h.begin();
      await h.document.fire('dragover', h.event('C', 0.9));
      await h.advance(16);
    }
    const drop = h.event('C', 0.9);
    if (kind === 'external payload') drop.dataTransfer.getData = () => 'external text';
    if (kind === 'outside grid') { drop.clientX = 900; drop.target = h.document.body; }
    if (kind === 'source slot') Object.assign(drop, h.event('A'));
    if (kind === 'side panel') {
      const panel = new DragElement(h.clock);
      panel.id = 'drag-move-panel';
      h.document.body.appendChild(panel);
      drop.target = panel;
    }
    await h.document.fire('drop', drop);
    await h.advance(1000);
    assert.equal(h.moves.length, 0);
    if (kind === 'no session') assert.equal(drop.prevented, false);
    else h.assertIdle();
  });
}

test('a new drag is declined while its predecessor is being saved without leaving source styles behind', async () => {
  const gate = deferred();
  const h = await setup({ move: () => gate.promise });
  h.begin();
  await h.document.fire('dragover', h.event('C', 0.9));
  await h.advance(16);
  const operation = h.document.fire('drop', h.event('C', 0.9));
  await h.flush();
  h.begin('B');
  assert.equal(h.controller.session, null);
  assert.equal(h.controller.saving, true);
  assert.equal(h.cards.get('B').element.classList.contains('is-dragging'), false);
  await h.document.fire('drop', h.event('B'));
  assert.equal(h.moves.length, 1);
  gate.resolve(true);
  await operation;
  await h.advance(180);
  h.assertIdle();
});

test('reduced motion keeps the same preview and drop behavior with no animation tween or lingering pause', async () => {
  const h = await setup({ reducedMotion: true });
  h.begin();
  await h.document.fire('dragover', h.event('C', 0.9));
  await h.advance(16);
  assert.equal(h.controller.duration(), 0);
  assert.equal(h.cards.get('B').element.style.transition, 'none');
  assert.equal(h.cards.get('B').element.style.transform, 'translate(-140px, 0px)');
  assert.equal(h.cards.get('A').element.style.transform || '', '');
  await h.document.fire('drop', h.event('C', 0.9));
  await h.flush();
  assert.equal(h.moves.length, 1);
  assert.equal([...h.cards.values()].flatMap(card => card.element.animationCalls).length, 0);
  h.assertIdle();
});
