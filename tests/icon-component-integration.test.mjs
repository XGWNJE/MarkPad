import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function read(path) {
  return await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('BookmarkCard resolves local icons first and lazily requests website resources', async () => {
  const source = await read('components/BookmarkCard.js');

  assert.match(source, /resolveBookmarkIcon\(this\.data, \{ storage: BookmarkStore \}\)/);
  assert.match(source, /resolveSiteIconWhenVisible/);
  assert.match(source, /IntersectionObserver/);
  assert.match(source, /BookmarkStore\.resolveSiteIcon/);
  assert.doesNotMatch(source, /favicon-initial|applyInitialToElement|canvas\.toDataURL/);
});

test('website icons use an isolated image element and are not injected as remote SVG markup', async () => {
  const source = await read('components/BookmarkCard.js');

  assert.match(source, /document\.createElement\('img'\)/);
  assert.match(source, /image\.referrerPolicy = 'no-referrer'/);
});

test('IconStudio offers only curated candidates and original-file upload controls', async () => {
  const source = await read('components/IconStudio.js');

  assert.match(source, /getLibraryIconCandidates/);
  assert.match(source, /readIconUpload/);
  assert.match(source, /保留原样/);
  assert.match(source, /自动融合/);
  assert.match(source, /屏幕取色/);
  assert.doesNotMatch(source, /IconSourceProvider|iconfont|Iconify|canvas/);
});

test('website icon backgrounds are stored as display preferences, not custom icon data', async () => {
  const studio = await read('components/IconStudio.js');
  const store = await read('core/BookmarkStore.js');
  const grid = await read('components/BookmarkGrid.js');

  assert.match(studio, /iconStudio:openSiteBackground/);
  assert.match(studio, /setSiteIconBackground\(this\.bookmark\.id/);
  assert.match(studio, /siteIcon:backgroundApplied/);
  assert.match(store, /SITE_ICON_BACKGROUND_STORAGE_KEY/);
  assert.match(store, /getSiteIconBackground\(bookmarkId\)/);
  assert.match(grid, /siteIcon:backgroundApplied/);
  assert.match(grid, /siteIcon:backgroundPreview/);
});

test('icon studio persists scale and card rendering applies it without changing the card boundary', async () => {
  const studio = await read('components/IconStudio.js');
  const card = await read('components/BookmarkCard.js');
  const cardCss = await read('css/modules/card.css');

  assert.match(studio, /class="icon-scale-input"/);
  assert.match(studio, /setIconScale\(scale\)/);
  assert.match(studio, /scale: this\.iconScale/);
  assert.match(studio, /scale: this\.iconScale \}/);
  assert.match(card, /--icon-content-scale/);
  assert.match(cardCss, /transform:\s*scale\(var\(--icon-content-scale, 1\)\);/);
});

test('background editor previews the actual card and does not use a native color input as its primary control', async () => {
  const studio = await read('components/IconStudio.js');
  const css = await read('css/modules/icon-studio.css');

  assert.match(studio, /icon-studio-preview-card bookmark-card/);
  assert.match(studio, /EyeDropper/);
  assert.match(studio, /analyzeIconBackground/);
  assert.match(studio, /BookmarkStore\.getCustomIcon\(bookmark\.id\)/);
  assert.match(studio, /customEditing/);
  assert.doesNotMatch(studio, /type="color"/);
  assert.match(css, /\.icon-hue-wheel/);
  assert.match(css, /\.icon-sv-plane/);
});

test('BookmarkGrid starts website-icon visibility observation only after each card is mounted', async () => {
  const source = await read('components/BookmarkGrid.js');
  const loadFolderBlock = source.match(/async loadFolder\(folderId\) \{[\s\S]*?\n  \}/)?.[0] || '';

  assert.match(loadFolderBlock, /this\.grid\.appendChild\(element\);\s*this\.cards\.set\(child\.id, card\);\s*\/\/[^\n]*\n\s*card\.resolveSiteIconWhenVisible\(\);/);
  assert.doesNotMatch(loadFolderBlock, /BookmarkStore\.resolveSiteIcon\(/);
});

test('website icon cache remains valid until the user manually requests a refresh', async () => {
  const store = await read('core/BookmarkStore.js');
  const card = await read('components/BookmarkCard.js');

  const cacheBlock = store.match(/getSiteIconEntry\(url\) \{[\s\S]*?\n  \}/)?.[0] || '';
  assert.doesNotMatch(cacheBlock, /TTL|checkedAt|Date\.now/);
  assert.match(cacheBlock, /return this\.siteIcons\.get\(key\) \|\| null;/);
  assert.match(card, /label: '图标：重新获取网站图标'/);
  assert.match(card, /BookmarkStore\.clearSiteIcon\(this\.data\.url\)/);
});

test('applying a saved custom-icon record re-resolves it before assigning image source', async () => {
  const source = await read('components/BookmarkCard.js');

  assert.match(source, /!iconData\.type && iconData\.data/);
  assert.match(source, /this\.updateIcon\(resolveBookmarkIcon\(this\.data, \{ storage: BookmarkStore \}\)\)/);
});
