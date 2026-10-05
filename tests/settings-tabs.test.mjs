import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { setPanelVisible } from '../core/MenuInteraction.js';
import { Element } from './helpers/grid-harness.mjs';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const pages = ['appearance', 'text', 'behavior'];

class SettingsElement extends Element {
  get hidden() { return this.attributes.has('hidden'); }
  set hidden(value) { if (value) this.attributes.set('hidden', ''); else this.attributes.delete('hidden'); }
  get inert() { return this.attributes.has('inert'); }
  set inert(value) { if (value) this.attributes.set('inert', ''); else this.attributes.delete('inert'); }
  get tabIndex() {
    const explicit = this.getAttribute('tabindex');
    return explicit === null ? (['button', 'input', 'select'].includes(this.tagName) ? 0 : -1) : Number(explicit);
  }
  set tabIndex(value) { this.setAttribute('tabindex', String(value)); }
  matches(selector) {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attribute) return attribute[2] === undefined ? this.attributes.has(attribute[1]) : this.getAttribute(attribute[1]) === attribute[2];
    return selector === this.tagName;
  }
  querySelectorAll(selector) {
    const result = [];
    const visit = node => {
      for (const child of node.children) {
        if (child.matches(selector)) result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }
  closest(selector) {
    for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node;
    return null;
  }
  get unavailable() {
    for (let node = this; node; node = node.parentElement) if (node.hidden || node.inert) return true;
    return false;
  }
  focus() {
    if (this.unavailable) return;
    this.ownerDocument.activeElement = this;
    super.focus();
  }
}

function parsePage(html) {
  const document = new SettingsElement('document');
  document.ownerDocument = document;
  const ids = new Map();
  const stack = [document];
  const voidTags = new Set(['meta', 'link', 'input', 'img', 'br', 'hr']);
  for (const token of html.match(/<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|[^<]+/g) || []) {
    if (token.startsWith('<!--')) continue;
    if (token.startsWith('</')) { stack.pop(); continue; }
    if (!token.startsWith('<')) {
      stack.at(-1).textContent = (stack.at(-1).textContent || '') + token.trim();
      continue;
    }
    const [, tag, attributes] = token.match(/^<([a-zA-Z][\w-]*)([^>]*)>/);
    const node = new SettingsElement(tag.toLowerCase());
    node.ownerDocument = document;
    for (const [, name, value] of attributes.matchAll(/([^\s=/"'>]+)(?:="([^"]*)")?/g)) node.setAttribute(name, value ?? '');
    if (node.attributes.has('value')) node.value = node.getAttribute('value');
    const id = node.getAttribute('id');
    if (id) { assert.equal(ids.has(id), false, 'Duplicate control ID: ' + id); ids.set(id, node); }
    stack.at(-1).appendChild(node);
    if (!voidTags.has(node.tagName)) stack.push(node);
  }
  document.getElementById = id => ids.get(id) || null;
  document.documentElement = document.querySelector('html');
  document.body = document.querySelector('body');
  document.documentElement.dataset.theme = 'dark';
  return { document, ids };
}

async function setupSettings() {
  const [html, settings, busSource] = await Promise.all([read('index.html'), read('components/SettingsPanel.js'), read('core/EventBus.js')]);
  const { document, ids } = parsePage(html);
  const stored = new Map(Object.entries({
    themeMode: 'dark', headerOpacity: '82', cardSize: '160', cardRadius: '20',
    gridPageMargin: '36', cardGap: '32', cardFontFamily: 'yahei', cardTitleSize: '20',
    cardTitleTracking: '4', openMode: 'current', backgroundEffect: 'on', backgroundEffectStrength: '85',
    custom_icon_cache: '{"keep":"custom"}'
  }));
  const writes = [];
  const localStorage = {
    getItem: key => stored.get(key) ?? null,
    setItem(key, value) { writes.push(key); stored.set(key, String(value)); }
  };
  const trigger = ids.get('menu-trigger');
  document.activeElement = trigger;
  const context = vm.createContext({ document, localStorage, console });
  vm.runInContext('globalThis.EventBus = (() => {' + busSource.replace('export default new EventBus();', 'return new EventBus();') + '})()', context);
  vm.runInContext(settings.replace(/^import .*;\r?\n/gm, '').replace('export default SettingsPanel;', 'globalThis.SettingsPanel = SettingsPanel;'), context);
  const panel = vm.runInContext('new SettingsPanel()', context);
  const menu = ids.get('menu-panel');
  setPanelVisible(menu, trigger, true);
  const tab = page => ids.get('settings-tab-' + page);
  const pane = page => ids.get('settings-pane-' + page);
  const dispatch = (node, type, data = {}) => {
    const event = {
      target: node, defaultPrevented: false, propagationStopped: false, ...data,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; }
    };
    for (let current = node; current; current = current.parentElement) {
      for (const listener of current.listeners.get(type) || []) listener(event);
      if (event.propagationStopped) break;
    }
    return event;
  };
  const input = (id, value, type = 'input') => { const node = ids.get(id); node.value = value; dispatch(node, type); };
  const tabStops = () => {
    const result = [];
    const visit = node => {
      for (const child of node.children) {
        if (!child.unavailable && child.tabIndex >= 0 && !child.disabled) result.push(child);
        visit(child);
      }
    };
    visit(menu);
    return result;
  };
  return { html, document, ids, stored, writes, panel, menu, trigger, bus: context.EventBus, tab, pane, dispatch, input, tabStops };
}

function assertPage(h, selected) {
  for (const page of pages) {
    assert.equal(h.tab(page).getAttribute('aria-selected'), String(page === selected));
    assert.equal(h.tab(page).tabIndex, page === selected ? 0 : -1);
    assert.equal(h.pane(page).hidden, page !== selected);
    assert.equal(h.tab(page).getAttribute('aria-controls'), h.pane(page).getAttribute('id'));
    assert.equal(h.pane(page).getAttribute('aria-labelledby'), h.tab(page).getAttribute('id'));
  }
  for (const page of pages.filter(page => page !== selected)) {
    assert.ok(h.tabStops().every(node => !h.pane(page).contains(node)), 'Inactive pane must not participate in Tab navigation');
  }
}

test('settings group all existing controls into three linked panes while keeping header and tabs outside the scroll region', async () => {
  const h = await setupSettings();
  assert.deepEqual(pages.map(page => h.tab(page).textContent), ['外观', '文字', '操作']);
  assert.equal(h.menu.getAttribute('role'), 'dialog');
  assert.equal(h.menu.getAttribute('aria-labelledby'), h.ids.get('settings-title').getAttribute('id'));
  assert.equal(h.menu.getAttribute('aria-modal'), null, 'Settings remain a nonmodal panel');
  assert.equal(h.menu.classList.contains('dialog'), false, 'Settings must not use fullscreen modal styling');
  assert.equal(h.trigger.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(h.ids.get('settings-tabs').getAttribute('role'), 'tablist');
  for (const page of pages) {
    assert.equal(h.tab(page).getAttribute('role'), 'tab');
    assert.equal(h.pane(page).getAttribute('role'), 'tabpanel');
  }
  for (const id of ['theme-group', 'card-size', 'card-radius', 'grid-page-margin', 'card-gap', 'header-opacity']) assert.ok(h.pane('appearance').contains(h.ids.get(id)));
  for (const id of ['card-font-family', 'card-title-size', 'card-title-tracking']) assert.ok(h.pane('text').contains(h.ids.get(id)));
  assert.ok(h.pane('behavior').contains(h.ids.get('open-mode-group')));
  assert.ok(h.pane('behavior').querySelector('.shortcuts-list'));
  const content = h.ids.get('settings-content');
  assert.equal(content.contains(h.ids.get('settings-tabs')), false);
  assert.equal(content.contains(h.ids.get('settings-close')), false);
  assert.ok(content.contains(h.pane('appearance')));
  assertPage(h, 'appearance');
  assert.equal(h.document.activeElement, h.trigger, 'Initialization must not steal focus');
});

test('clicking tabs changes the active pane and focus without mutating any preference', async () => {
  const h = await setupSettings();
  const before = new Map(h.stored);
  const writes = h.writes.length;
  h.ids.get('settings-content').scrollTop = 300;
  for (const page of ['text', 'behavior', 'appearance']) {
    h.dispatch(h.tab(page), 'click');
    assertPage(h, page);
    assert.equal(h.document.activeElement, h.tab(page));
    assert.equal(h.ids.get('settings-content').scrollTop, 0);
  }
  h.dispatch(h.tab('text'), 'click');
  h.ids.get('card-size').focus();
  assert.equal(h.document.activeElement, h.tab('text'), 'Hidden controls cannot receive focus');
  assert.deepEqual(h.stored, before);
  assert.equal(h.writes.length, writes, 'Page selection must not create a storage key');
});

test('left/right arrows wrap and Home/End switch tabs with one focusable tab', async () => {
  const h = await setupSettings();
  let current = 'appearance';
  for (const [key, expected] of [
    ['ArrowRight', 'text'], ['ArrowRight', 'behavior'], ['ArrowRight', 'appearance'],
    ['ArrowLeft', 'behavior'], ['Home', 'appearance'], ['End', 'behavior']
  ]) {
    const event = h.dispatch(h.tab(current), 'keydown', { key });
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.propagationStopped, true);
    assertPage(h, expected);
    assert.equal(h.document.activeElement, h.tab(expected));
    current = expected;
  }
  for (const data of [{ key: 'Tab' }, { key: 'ArrowLeft', altKey: true }, { key: 'ArrowRight', ctrlKey: true }]) {
    const event = h.dispatch(h.tab(current), 'keydown', data);
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.propagationStopped, false);
    assertPage(h, current);
  }
});

test('appearance and text values survive repeated page switches and update the same existing preference keys', async () => {
  const h = await setupSettings();
  h.input('card-size', '180');
  h.input('card-radius', '24');
  h.input('header-opacity', '90');
  h.dispatch(h.tab('text'), 'click');
  h.input('card-font-family', 'serif', 'change');
  h.input('card-title-size', '18');
  h.input('card-title-tracking', '2');
  h.dispatch(h.tab('behavior'), 'click');
  h.dispatch(h.ids.get('open-mode-new'), 'click');
  h.dispatch(h.tab('appearance'), 'click');
  assert.equal(h.ids.get('card-size').value, '180');
  assert.equal(h.ids.get('card-radius').value, '24');
  assert.equal(h.ids.get('header-opacity').value, '90');
  h.dispatch(h.tab('text'), 'click');
  assert.equal(h.ids.get('card-font-family').value, 'serif');
  assert.equal(h.ids.get('card-title-size').value, '18');
  assert.equal(h.ids.get('card-title-tracking').value, '2');
  assert.equal(h.stored.get('cardSize'), '180');
  assert.equal(h.stored.get('cardRadius'), '24');
  assert.equal(h.stored.get('cardTitleSize'), '18');
  assert.equal(h.stored.get('openMode'), 'new');
  assert.equal(h.stored.get('backgroundEffect'), 'on');
  assert.equal(h.stored.get('backgroundEffectStrength'), '85');
  assert.equal(h.stored.get('custom_icon_cache'), '{"keep":"custom"}');
  assert.equal(h.document.documentElement.style.getPropertyValue('--card-title-size'), '18px');
});

test('theme and open behavior choices synchronize visual and pressed state from stored values and clicks', async () => {
  const h = await setupSettings();
  const assertChoice = (prefix, values, selected) => {
    for (const value of values) {
      const button = h.ids.get(prefix + value);
      assert.equal(button.getAttribute('aria-pressed'), String(value === selected));
      assert.equal(button.classList.contains('active'), value === selected);
    }
  };
  assertChoice('theme-', ['light', 'dark'], 'dark');
  assertChoice('open-mode-', ['new', 'current'], 'current');
  h.dispatch(h.ids.get('theme-light'), 'click');
  assertChoice('theme-', ['light', 'dark'], 'light');
  assert.equal(h.document.documentElement.dataset.theme, 'light');
  assert.equal(h.stored.get('themeMode'), 'light');
  h.dispatch(h.tab('behavior'), 'click');
  h.dispatch(h.ids.get('open-mode-new'), 'click');
  assertChoice('open-mode-', ['new', 'current'], 'new');
  assert.equal(h.stored.get('openMode'), 'new');
});

test('the close button emits one close request and the existing visibility contract returns focus', async () => {
  const h = await setupSettings();
  const before = new Map(h.stored);
  let closes = 0;
  h.bus.on('settings:close', () => {
    closes++;
    setPanelVisible(h.menu, h.trigger, false, { returnFocus: true });
  });
  h.dispatch(h.tab('text'), 'click');
  h.dispatch(h.ids.get('settings-close'), 'click');
  assert.equal(closes, 1);
  assert.equal(h.menu.inert, true);
  assert.equal(h.menu.getAttribute('aria-hidden'), 'true');
  assert.equal(h.trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(h.document.activeElement, h.trigger);
  assert.deepEqual(h.stored, before);
  assert.equal(h.tabStops().length, 0);
});
