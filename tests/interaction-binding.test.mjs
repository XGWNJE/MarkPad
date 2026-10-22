import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { activateMenu, bindMenuKeyboard, closeMenus, releaseMenu, setPanelVisible } from '../core/MenuInteraction.js';
import { Element } from './helpers/grid-harness.mjs';

class InteractiveElement extends Element {
  constructor(tag = 'div', document) {
    super(tag);
    this.tagName = tag.toUpperCase();
    this.ownerDocument = document;
    this.capture = new Map();
  }
  addEventListener(name, callback, options) {
    super.addEventListener(name, callback);
    this.capture.set(callback, options === true || Boolean(options?.capture));
  }
  matches(selector) {
    if (selector.endsWith(':not([disabled])')) return !this.disabled && this.matches(selector.slice(0,-':not([disabled])'.length));
    if (selector === '.dialog:not(.hidden)') return this.classes.has('dialog') && !this.classes.has('hidden');
    if (selector.startsWith('.')) return this.classes.has(selector.slice(1));
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    const attributes = [...selector.matchAll(/\[([\w-]+)="([^"]*)"\]/g)];
    return attributes.length ? attributes.every(([, name, value]) => this.getAttribute(name) === value)
      : this.tagName.toLowerCase() === selector;
  }
  closest(selector) {
    for (let element = this; element; element = element.parentElement) {
      if (selector.split(',').some(value => element.matches(value.trim()))) return element;
    }
    return null;
  }
  querySelectorAll(selector) {
    const selectors = selector.split(',').map(value => value.trim());
    const children = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
    return selector === '*' ? children : children.filter(child => selectors.some(value => child.matches(value)));
  }
  focus() {
    for (let element = this; element; element = element.parentElement) if (element.inert) return;
    this.ownerDocument.activeElement = this;
    this.focusCount = (this.focusCount || 0) + 1;
    this.fire('focusin');
  }
  scrollIntoView() {}
  click() { this.fire('click', { detail: 0 }); }
  getClientRects() { return this.closest('.hidden') ? [] : [{}]; }
  getBoundingClientRect() { return { left: 80, top: 80, right: 300, bottom: 380, width: 220, height: 300 }; }
  fire(name, values = {}) {
    const event = { target: this, key: '', shiftKey: false, ...values,
      preventDefault() { this.prevented = true; },
      stopPropagation() { this.stopped = true; },
      stopImmediatePropagation() { this.stopped = true; this.immediate = true; }
    };
    const path = [];
    for (let element = this; element; element = element.parentElement) path.push(element);
    const invoke = (element, capture) => {
      for (const callback of [...element.listeners.get(name) || []]) {
        if (element.capture.get(callback) === capture) callback(event);
        if (event.immediate) break;
      }
    };
    for (const element of [...path].reverse()) { invoke(element, true); if (event.stopped) return event; }
    for (const element of path) { invoke(element, false); if (event.stopped) break; }
    return event;
  }
}

async function setup({ tabs = false } = {}) {
  closeMenus();
  const document = new InteractiveElement('document');
  document.ownerDocument = document;
  document.body = new InteractiveElement('body', document);
  document.body.connected = true;
  document.appendChild(document.body);
  document.createElement = tag => new InteractiveElement(tag, document);
  const elements = new Map();
  const create = (id, tag, parent = document.body) => {
    const element = document.createElement(tag);
    element.id = id;
    parent.appendChild(element);
    elements.set(id, element);
    return element;
  };
  document.getElementById = id => elements.get(id);
  const trigger = create('menu-trigger', 'button');
  const cardElement = create('card-A', 'div');
  cardElement.className = 'bookmark-card';
  const nextCard = create('card-B', 'div');
  nextCard.className = 'bookmark-card';
  // Match the real topology: the settings panel follows the grid cards.
  const panel = create('menu-panel', 'div');
  panel.className='dialog hidden';
  const overlay=create('settings-overlay','div',panel);overlay.className='dialog-overlay';
  let close;
  let selectedTab;
  if (tabs) {
    close = create('settings-close', 'button', panel);
    const tablist = create('settings-tabs', 'div', panel);
    for (const id of ['appearance', 'text', 'behavior']) {
      const tab = create(`settings-tab-${id}`, 'button', tablist);
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(id === 'text'));
      if (id === 'text') selectedTab = tab;
    }
  }
  const first = create('theme-light', 'button', panel);
  create('theme-dark', 'button', panel);
  const group = create('open-mode-group', 'div', panel);
  create('open-mode-new', 'button', group);
  create('open-mode-current', 'button', group);

  let now = 0;
  let sequence = 0;
  const tasks = new Map();
  const setTimeout = (callback, delay = 0) => {
    const id = ++sequence;
    tasks.set(id, { callback, at: now + delay });
    return id;
  };
  const clearTimeout = id => tasks.delete(id);
  const advance = amount => {
    const until = now + amount;
    while (true) {
      const next = [...tasks].filter(([, task]) => task.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      tasks.delete(next[0]);
      now = next[1].at;
      next[1].callback();
    }
    now = until;
  };
  const window = new InteractiveElement('window', document);
  Object.assign(window, { innerWidth: 1000, innerHeight: 800, setTimeout, clearTimeout });
  document.defaultView = window;
  const emitted = [];
  const handlers = new Map();
  const EventBus = {
    on(name, callback) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(callback);
    },
    emit(name, payload) {
      emitted.push([name, payload]);
      for (const callback of handlers.get(name) || []) callback(payload);
    }
  };
  const context = vm.createContext({
    document, window, AbortController, activateMenu, bindMenuKeyboard, closeMenus, releaseMenu, setPanelVisible,
    localStorage: { getItem: () => null, setItem() {} },
    BookmarkStore: { getCustomIcon: () => null }, iconSvg: () => '<svg></svg>',
    Router: { canBack: () => false }, EventBus,
    CardNavigation: { cancel() {} },
    requestAnimationFrame: callback => setTimeout(callback, 16), cancelAnimationFrame: clearTimeout
  });
  const [appSource, cardSource] = await Promise.all([
    readFile(new URL('../main.js', import.meta.url), 'utf8'),
    readFile(new URL('../components/BookmarkCard.js', import.meta.url), 'utf8')
  ]);
  vm.runInContext(appSource.replace(/^import .*;\r?\n/gm, '')
    .replace(/new App\(\);\s*$/, 'globalThis.App = App;'), context);
  vm.runInContext(cardSource.replace(/^import .*;\r?\n/gm, '')
    .replace('export default BookmarkCard;', 'globalThis.BookmarkCard = BookmarkCard;'), context);
  const app = Object.create(context.App.prototype);
  app.bindMenuLifecycle();
  app.bindKeyboardShortcuts();
  app.bindMenuPanel();
  trigger.addEventListener('click',()=>EventBus.emit('settings:open'));
  trigger.addEventListener('keydown',e=>{if(e.key==='ArrowDown') {e.preventDefault();EventBus.emit('settings:open');}});
  const card = new context.BookmarkCard({ id: 'A', title: 'A', url: 'https://a.example' });
  card.element = cardElement;
  let opens = 0;
  card.open = () => opens++;
  card.bindEvents();
  return { document, window, trigger, panel, first, close, selectedTab, card, cardElement, nextCard, advance, emitted, EventBus, opens: () => opens };
}

test('settings open as a modal and Escape restores its entry focus',async()=>{const h=await setup({tabs:true});h.trigger.focus();h.trigger.fire('click');assert.equal(h.panel.inert,false);assert.equal(h.document.activeElement,h.selectedTab);h.selectedTab.fire('keydown',{key:'Escape'});assert.equal(h.panel.inert,true);assert.equal(h.document.activeElement,h.trigger);});
test('settings preserve input shortcuts and prevent page actions underneath',async()=>{const h=await setup({tabs:true});h.trigger.fire('click');const input=h.document.createElement('input');h.panel.appendChild(input);input.focus();input.fire('keydown',{key:'n'});assert.equal(h.emitted.some(([name])=>name==='toolbar:newBookmark'),false);h.EventBus.emit('settings:close');h.cardElement.focus();h.cardElement.fire('keydown',{key:'n'});assert.equal(h.emitted.some(([name])=>name==='toolbar:newBookmark'),true);});
test('card menu bindings own arrows, restore Escape focus, and leave Tab unblocked', async () => {
  const h = await setup();
  h.cardElement.focus();
  h.cardElement.fire('keydown', { key: 'F10', shiftKey: true });
  const menu = h.card.contextMenu;
  const items = menu.querySelectorAll('[role="menuitem"]');
  assert.equal(h.document.activeElement, items[0]);
  assert.equal(items[0].fire('keydown', { key: 'ArrowDown' }).prevented, true);
  assert.equal(h.document.activeElement, items[1]);
  items[1].fire('keydown', { key: 'Escape' });
  assert.equal(h.card.contextMenu, null);
  assert.equal(h.document.activeElement, h.cardElement);
  h.cardElement.fire('keydown', { key: 'ContextMenu' });
  const tab = h.document.activeElement.fire('keydown', { key: 'Tab' });
  assert.equal(Boolean(tab.prevented), false);
  assert.equal(h.document.activeElement, h.cardElement);
  assert.equal(h.card.contextMenu, null);
});

test('resize closes the menu and releases keyboard, resize, and delayed outside listeners', async () => {
  for (const delay of [0, 20]) {
    const h = await setup();
    h.cardElement.fire('keydown', { key: 'ContextMenu' });
    const menu = h.card.contextMenu;
    h.advance(delay);
    h.window.innerWidth = 600;
    h.window.fire('resize');
    assert.equal(h.card.contextMenu, null);
    assert.equal(h.document.activeElement, h.cardElement);
    assert.equal(h.window.listeners.get('resize').size, 0);
    assert.equal(menu.listeners.get('keydown').size, 0);
    h.advance(100);
    assert.equal(h.document.listeners.get('contextmenu')?.size || 0, 0);
    assert.equal(h.document.listeners.get('click')?.size || 0, 0);
    assert.equal(h.document.listeners.get('pointerdown').size, 0);
    assert.equal(h.document.listeners.get('scroll').size, 0);
  }
});

test('opening modal settings releases the card menu before focus enters settings',async()=>{const h=await setup({tabs:true});h.card.showContextMenu(80,80);h.trigger.fire('click');assert.equal(h.card.contextMenu,null);assert.equal(h.panel.inert,false);assert.equal(h.document.activeElement,h.selectedTab);h.EventBus.emit('settings:close');assert.equal(h.panel.inert,true);});
test('modal opening releases menus before the modal subscriber handles its event', async () => {
  for (const name of ['toolbar:newBookmark', 'toolbar:newFolder', 'card:editTitle', 'card:move',
    'iconStudio:open', 'iconStudio:openSiteBackground', 'card:requestDelete']) {
    const h = await setup();
    h.card.showContextMenu(80, 80);
    let handled = false;
    h.EventBus.on(name, () => {
      handled = true;
      assert.equal(h.card.contextMenu, null);
      assert.equal(h.panel.inert, true);
    });
    h.EventBus.emit(name, { id: 'A' });
    assert.equal(handled, true);
  }
});

test('an open modal retains keyboard focus even if a menu was opened out of sequence', async () => {
  const h = await setup();
  h.card.showContextMenu(80, 80);
  const dialog = h.document.createElement('div');
  dialog.className = 'dialog';
  const input = h.document.createElement('input');
  dialog.appendChild(input);
  dialog.querySelectorAll = () => [input];
  h.document.body.appendChild(dialog);
  const key = h.document.activeElement.fire('keydown', { key: 'ArrowDown' });
  assert.equal(key.prevented, true);
  assert.equal(h.document.activeElement, input);
  assert.equal(h.card.contextMenu, null);
});

test('F2 inside the card menu activates rename through the real action binding', async () => {
  const h = await setup();
  h.card.showContextMenu(80, 80);
  h.document.activeElement.fire('keydown', { key: 'F2' });
  assert.equal(h.card.contextMenu, null);
  assert.equal(h.emitted.some(([name]) => name === 'card:editTitle'), true);
  assert.equal(h.document.activeElement, h.cardElement);
});

test('a canceled long press never consumes the next independent click', async () => {
  const h = await setup();
  h.cardElement.fire('pointerdown', { pointerType: 'touch', clientX: 80, clientY: 80 });
  h.advance(549);
  assert.equal(h.card.contextMenu, null);
  h.advance(1);
  assert.ok(h.card.contextMenu);
  h.cardElement.fire('pointercancel');
  h.document.activeElement.fire('keydown', { key: 'Escape' });
  assert.equal(h.card.suppressNextClick, false);
  h.cardElement.fire('pointerdown', { pointerType: 'mouse' });
  assert.equal(Boolean(h.cardElement.fire('click').prevented), true);
  assert.equal(h.opens(), 1);
});

test('same-gesture long-press click stays suppressed while a new gesture clears stale state', async () => {
  const h = await setup();
  h.cardElement.fire('pointerdown', { pointerType: 'touch', clientX: 80, clientY: 80 });
  h.advance(550);
  h.cardElement.fire('pointerup');
  assert.equal(h.cardElement.fire('click').prevented, true);
  assert.equal(h.opens(), 0);
  assert.ok(h.card.contextMenu, 'the suppressed click must not bubble into the outside-menu closer');
  h.cardElement.fire('pointerdown', { pointerType: 'touch', clientX: 80, clientY: 80 });
  h.advance(550);
  h.card.closeContextMenu(true);
  assert.equal(h.card.suppressNextClick, true);
  h.cardElement.fire('pointerdown', { pointerType: 'mouse' });
  assert.equal(h.card.suppressNextClick, false);
  h.cardElement.fire('click');
  assert.equal(h.opens(), 1);
});
