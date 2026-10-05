import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { Element } from './helpers/grid-harness.mjs';

async function setup({ url = 'https://example.com', custom = false, site = false } = {}) {
  class MenuElement extends Element {
    querySelectorAll(selector) {
      if (selector === '[role="menuitem"]') return this.children.filter(item => item.getAttribute('role') === 'menuitem');
      return super.querySelectorAll(selector);
    }
    focus() { super.focus(); document.activeElement = this; }
    click() { for (const listener of this.listeners.get('click') || []) listener({ target: this, stopPropagation() {} }); }
  }
  const document = { createElement: tag => new MenuElement(tag), activeElement: null };
  document.body = new MenuElement();
  document.body.connected = true;
  document.querySelectorAll = selector => document.body.querySelectorAll(selector);
  const emitted = [];
  const registry = { active: null, released: [] };
  const context = vm.createContext({
    document, window: { innerWidth: 1000, innerHeight: 800 },
    BookmarkStore: { getCustomIcon: () => custom ? { kind: 'image', data: 'test' } : null },
    iconSvg: () => '<svg></svg>', EventBus: { emit: (name, data) => emitted.push([name, data]) },
    activateMenu(menu) { registry.active = menu; }, releaseMenu(menu) { registry.released.push(menu); registry.active = null; },
    bindMenuKeyboard: () => () => {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {}
  });
  const source = await readFile(new URL('../components/BookmarkCard.js', import.meta.url), 'utf8');
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, '')
    .replace('export default BookmarkCard;', 'globalThis.BookmarkCard = BookmarkCard;'), context);
  const card = new context.BookmarkCard({ id: 'A', title: '测试目标', ...(url && { url }) });
  card.element = new MenuElement();
  document.body.appendChild(card.element);
  card.siteIconModel = site ? { source: 'site', type: 'image', value: 'test' } : null;
  const actions = [];
  card.removeCustomIcon = () => actions.push('restore');
  card.refreshWebsiteIcon = () => actions.push('refresh');
  card.showContextMenu(80, 80);
  const menu = card.contextMenu;
  const items = menu.querySelectorAll('[role="menuitem"]');
  const labels = () => items.map(item => item.children[1].textContent);
  const choose = label => items.find(item => item.children[1].textContent === label).click();
  return { card, menu, items, labels, choose, emitted, actions, registry, document };
}

test('card menu names its target and separates rename, move, icon and delete actions', async () => {
  const h = await setup();
  assert.equal(h.menu.children[0].textContent, '测试目标');
  assert.equal(h.menu.getAttribute('aria-label'), '测试目标的操作');
  assert.deepEqual(h.labels(), ['重命名…', '移动到…', '选择或上传图标…', '重新获取网站图标', '删除']);
  assert.equal(h.items[0].getAttribute('aria-keyshortcuts'), 'F2');
  assert.equal(h.items.at(-1).classList.contains('danger'), true);
  assert.equal(h.menu.querySelectorAll('.context-menu-separator').length, 2);
  h.choose('移动到…');
  assert.equal(h.emitted[0][0], 'card:move');
  assert.equal(h.emitted[0][1].id, 'A');
  assert.equal(h.emitted[0][1].returnFocus, h.card.element);
  assert.equal(h.card.contextMenu, null);
  assert.equal(h.registry.released[0], h.menu);
});

test('a custom folder restores the default folder icon without website actions', async () => {
  const h = await setup({ url: null, custom: true });
  assert.deepEqual(h.labels(), ['重命名…', '移动到…', '编辑图标…', '恢复默认文件夹图标', '删除']);
  h.choose('恢复默认文件夹图标');
  assert.deepEqual(h.actions, ['restore']);
  assert.deepEqual(h.emitted, []);
});

test('a custom bookmark edits its icon or restores the normal icon resolution', async () => {
  const h = await setup({ custom: true });
  assert.deepEqual(h.labels(), ['重命名…', '移动到…', '编辑图标…', '恢复默认图标', '删除']);
  h.choose('编辑图标…');
  assert.equal(h.emitted[0][0], 'iconStudio:open');
  assert.equal(h.emitted[0][1].bookmark, h.card.data);
  assert.equal(h.emitted[0][1].returnFocus, h.card.element);
});

test('website appearance is offered only for an available website icon', async () => {
  const h = await setup({ site: true });
  assert.deepEqual(h.labels(), ['重命名…', '移动到…', '选择或上传图标…', '调整网站图标…', '重新获取网站图标', '删除']);
  h.choose('调整网站图标…');
  assert.equal(h.emitted[0][0], 'iconStudio:openSiteBackground');
});

test('unsupported addresses and plain folders never advertise a website refresh', async () => {
  for (const url of ['chrome://bookmarks', 'file:///test.html', null]) {
    const h = await setup({ url });
    assert.equal(h.labels().includes('重新获取网站图标'), false);
    assert.equal(h.labels().includes('调整网站图标…'), false);
  }
  const h = await setup();
  h.choose('重新获取网站图标');
  assert.deepEqual(h.actions, ['refresh']);
});
