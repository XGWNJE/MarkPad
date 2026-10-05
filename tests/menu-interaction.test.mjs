import assert from 'node:assert/strict';
import test from 'node:test';
import { bindMenuKeyboard, setPanelVisible } from '../core/MenuInteraction.js';
import { Element } from './helpers/grid-harness.mjs';

test('hidden settings stay inert and opening/closing synchronizes accessible state', () => {
  const panel = new Element();
  const trigger = new Element('button');
  setPanelVisible(panel, trigger, false);
  assert.equal(panel.inert, true);
  assert.equal(panel.getAttribute('aria-hidden'), 'true');
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  setPanelVisible(panel, trigger, true);
  assert.equal(panel.inert, false);
  assert.equal(panel.getAttribute('aria-hidden'), 'false');
  assert.equal(panel.classList.contains('visible'), true);
  assert.equal(trigger.classList.contains('active'), true);
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  setPanelVisible(panel, trigger, false, { returnFocus: true });
  assert.equal(trigger.focusCount, 1);
  assert.equal(panel.inert, true);
  assert.equal(panel.classList.contains('visible'), false);
  setPanelVisible(panel, trigger, false, { returnFocus: true });
  assert.equal(trigger.focusCount, 1, 'closing an already hidden panel must not steal focus');
});

function setupMenu() {
  const document = { activeElement: null };
  const items = Array.from({ length: 3 }, () => {
    const item = new Element('button');
    item.focus = () => { document.activeElement = item; };
    item.scrollIntoView = () => {};
    return item;
  });
  const menu = new Element();
  menu.ownerDocument = document;
  menu.querySelectorAll = () => items;
  const closed = [];
  const cleanup = bindMenuKeyboard(menu, returnFocus => closed.push(returnFocus));
  const press = (key, values = {}) => {
    const event = { key, prevented: false, stopped: false, ...values,
      preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
    for (const handler of menu.listeners.get('keydown') || []) handler(event);
    return event;
  };
  return { document, items, menu, closed, cleanup, press };
}

test('menu arrows wrap and Home/End move focus without activating an action', () => {
  const { document, items, closed, press } = setupMenu();
  assert.equal(document.activeElement, items[0]);
  assert.deepEqual(items.map(item => item.tabIndex), [0, -1, -1]);
  assert.equal(press('ArrowUp').prevented, true);
  assert.equal(document.activeElement, items[2]);
  press('ArrowDown');
  assert.equal(document.activeElement, items[0]);
  press('End');
  assert.equal(document.activeElement, items[2]);
  press('Home');
  assert.equal(document.activeElement, items[0]);
  assert.deepEqual(closed, []);
});

test('Escape restores focus and Tab allows the normal next focus stop', () => {
  const { closed, press, cleanup } = setupMenu();
  const escape = press('Escape');
  assert.equal(escape.prevented, true);
  assert.equal(escape.stopped, true);
  const tab = press('Tab');
  assert.equal(tab.prevented, false);
  assert.equal(tab.stopped, true);
  assert.deepEqual(closed, [true, true]);
  cleanup();
  press('Escape');
  assert.equal(closed.length, 2, 'detaching the menu removes its keyboard listener');
});

test('declared menu shortcuts activate the action, excluding modifiers and composition', () => {
  const { items, press } = setupMenu();
  let activations = 0;
  items[0].setAttribute('aria-keyshortcuts', 'F2');
  items[0].addEventListener('click', () => activations++);
  for (const values of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { isComposing: true }]) {
    assert.equal(press('F2', values).prevented, false);
  }
  assert.equal(activations, 0);
  assert.equal(press('F2').prevented, true);
  assert.equal(activations, 1);
});
