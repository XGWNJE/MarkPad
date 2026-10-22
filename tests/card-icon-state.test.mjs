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

test('an undecodable cached icon always falls back to the text surface and is demoted once', () => {
  const { icon, classes, card } = prepare();

  const demoted = [];
  BookmarkStore.markSiteIconDisplayFailure = (url, value) => demoted.push([url, value]);

  const model = { type: 'image', value: 'data:image/png;base64,broken', source: 'site' };
  card.updateIcon(model);
  assert.equal(card.siteIconModel, model);

  // 解码失败时不留破图：退回文字面，并把这份字节降级为带退避的失败记录。
  icon.image.dispatch('error');
  assert.equal(classes.has('iconless'), true);
  assert.equal(icon.innerHTML, '');
  assert.equal(card.siteIconModel, null);
  assert.deepEqual(demoted, [['https://example.com', model.value]]);

  // 第二次失败同样不留破图，但不会再写一次降级记录。
  card.updateIcon(model);
  icon.image.dispatch('error');
  assert.equal(classes.has('iconless'), true);
  assert.equal(icon.innerHTML, '');
  assert.equal(demoted.length, 1);
});

test('late errors from a replaced icon never clear the icon that is displayed now', () => {
  const { icon, classes, card } = prepare();

  const demoted = [];
  BookmarkStore.markSiteIconDisplayFailure = (url, value) => demoted.push([url, value]);

  const stale = { type: 'image', value: 'data:image/gif;base64,old', source: 'site' };
  card.updateIcon(stale);
  const staleImage = icon.image;

  const current = { type: 'image', value: 'data:image/gif;base64,new', source: 'site' };
  card.updateIcon(current);
  assert.equal(card.siteIconModel, current);

  // 旧图片的迟到 error 不能影响当前图标，也不能清掉当前地址的缓存。
  staleImage.dispatch('error');
  assert.equal(card.siteIconModel, current);
  assert.equal(classes.has('iconless'), false);
  assert.deepEqual(demoted, []);
});

test('a bundled clay PNG loading failure falls back to the same flat icon', () => {
  const { icon, classes, card } = prepare();
  const value = 'https://extension.test/clay/github.png';
  const fallbackValue = 'https://extension.test/flat/github.svg';
  card.updateIcon({ type: 'image', value, fallbackValue, source: 'curated-library' });
  assert.equal(icon.style.background, 'var(--color-builtin-icon-bg)');
  icon.image.dispatch('error');
  assert.equal(icon.image.src, fallbackValue);
  assert.equal(classes.has('iconless'), false);
});

test('removing a folder override restores its named built-in rather than the generic folder', () => {
  const { icon, classes, card } = prepare();
  card.isFolder = true;
  card.data = { id: 'folder-1', title: '长期留存' };
  card.updateIcon(null);
  assert.ok(icon.image.src.endsWith('/clay/archive.png'));
  assert.equal(classes.has('icon:folder-default'), false);
});

test('renaming a named folder immediately updates its built-in identity', async () => {
  const { icon, card } = prepare();
  card.isFolder = true;
  card.data = { id: 'folder-1', title: '长期留存' };
  await card.update({ title: '分享', childCount: 0 });
  assert.ok(icon.image.src.endsWith('/clay/share.png'));
});

test('renaming a named folder to an ordinary name restores the default theme background', async () => {
  const { icon, classes, card } = prepare();
  card.isFolder = true;
  card.data = { id: 'folder-1', title: '长期留存' };
  card.updateIcon(null);
  await card.update({ title: '其他资料', childCount: 0 });
  assert.equal(classes.has('icon:folder-default'), true);
  assert.equal(icon.style.background, '');
});
