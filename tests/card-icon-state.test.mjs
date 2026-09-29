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
globalThis.document = { documentElement: {} };

const [{ default: BookmarkCard }, { default: BookmarkStore }] = await Promise.all([
  import('../components/BookmarkCard.js'),
  import('../core/BookmarkStore.js')
]);

test('missing and failed website icons show text until an icon is applied', () => {
  BookmarkStore.customIcons = new Map();
  BookmarkStore.siteIconBackgrounds = new Map();

  const classes = new Set();
  const icon = {
    innerHTML: '',
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
  globalThis.document = { createElement: () => ({}) };
  const card = new BookmarkCard({ id: 'bookmark-1', title: 'Example', url: 'https://example.com' }, null);
  card.element = {
    querySelector: () => icon,
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      }
    }
  };

  card.updateIcon(null);
  assert.equal(classes.has('iconless'), true);

  card.updateIcon({ type: 'image', value: 'https://example.com/icon.png', source: 'site' });
  assert.equal(classes.has('iconless'), false);
  assert.equal(icon.image.src, 'https://example.com/icon.png');

  card.updateIcon(null);
  assert.equal(classes.has('iconless'), true);

  BookmarkStore.customIcons.set('bookmark-1', { kind: 'image', data: 'data:image/png;base64,AA==' });
  card.updateIcon({ kind: 'image', data: 'data:image/png;base64,AA==' });
  assert.equal(classes.has('iconless'), false);
});
