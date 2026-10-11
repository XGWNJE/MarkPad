import assert from 'node:assert/strict';
import test from 'node:test';

const event = { addListener() {} };
globalThis.chrome = {
  bookmarks: Object.fromEntries(
    ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered']
      .map(name => [name, event])
  )
};
globalThis.gsap = {};
globalThis.MutationObserver = class { observe() {} };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { documentElement: {} };

const [{ default: BookmarkCard }, { default: BookmarkStore }] = await Promise.all([
  import('../components/BookmarkCard.js'),
  import('../core/BookmarkStore.js')
]);

function createImageElement() {
  const listeners = new Map();
  return {
    src: '',
    listeners,
    addEventListener(type, handler) { listeners.set(type, handler); },
    dispatch(type) { listeners.get(type)?.(); }
  };
}

function createIconElement(classes) {
  return {
    innerHTML: '',
    image: null,
    style: {
      setProperty() {},
      removeProperty() {}
    },
    classList: {
      add(name) { classes.add(`icon:${name}`); },
      remove(name) { classes.delete(`icon:${name}`); }
    },
    appendChild(image) { this.image = image; }
  };
}

function createCard(icon, classes) {
  const card = new BookmarkCard({ id: 'bookmark-1', title: 'Example', url: 'https://example.com' }, null);
  card.element = {
    isConnected: true,
    querySelector: () => icon,
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      }
    }
  };
  return card;
}

function prepare() {
  BookmarkStore.customIcons = new Map();
  BookmarkStore.siteIconBackgrounds = new Map();
  BookmarkStore.siteIcons = new Map();
  const classes = new Set();
  const icon = createIconElement(classes);
  globalThis.document = { createElement: () => createImageElement() };
  return { icon, classes, card: createCard(icon, classes) };
}

test('missing and failed website icons show text until an icon is applied', () => {
  const { icon, classes, card } = prepare();

  card.updateIcon(null);
  assert.equal(classes.has('iconless'), true);

  card.updateIcon({ type: 'image', value: 'data:image/png;base64,AA==', source: 'site' });
  assert.equal(classes.has('iconless'), false);
  assert.equal(icon.image.src, 'data:image/png;base64,AA==');

  card.updateIcon(null);
  assert.equal(classes.has('iconless'), true);

  BookmarkStore.customIcons.set('bookmark-1', { kind: 'image', data: 'data:image/png;base64,AA==' });
  card.updateIcon({ kind: 'image', data: 'data:image/png;base64,AA==' });
  assert.equal(classes.has('iconless'), false);
});

test('an undecodable cached icon clears its address cache and retries once', () => {
  const { icon, classes, card } = prepare();

  const cleared = [];
  const retries = [];
  BookmarkStore.clearSiteIcon = url => cleared.push(url);
  card.resolveSiteIconWhenVisible = () => retries.push('retry');

  const model = { type: 'image', value: 'data:image/png;base64,broken', source: 'site' };
  card.updateIcon(model);
  assert.equal(card.siteIconModel, model);

  // 解码失败时不留破图：清掉该地址缓存并自动重试一次。
  icon.image.dispatch('error');
  assert.equal(classes.has('iconless'), true);
  assert.equal(icon.innerHTML, '');
  assert.equal(card.siteIconModel, null);
  assert.deepEqual(cleared, ['https://example.com']);
  assert.deepEqual(retries, ['retry']);

  // 第二次失败不再循环重试。
  card.updateIcon(model);
  icon.image.dispatch('error');
  assert.deepEqual(retries, ['retry']);
});
