import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { setupGrid } from './helpers/grid-harness.mjs';

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

test('icon content fills the card by default in both rendering paths', async () => {
  const cardCss = await read('css/modules/card.css');

  assert.match(cardCss, /\.card-icon svg \{[^}]*width: 100%;[^}]*height: 100%;[^}]*\}/);
  assert.match(cardCss, /\.card-icon-image \{[^}]*width: 100%;[^}]*height: 100%;[^}]*object-fit: contain;[^}]*\}/);
  // 缩放 100% 即填满；默认文件夹图标是应用自身的线性图形，保持原来的比例。
  assert.match(cardCss, /\.card-icon\.folder-default \.card-folder-svg \{[^}]*width: 56%;[^}]*\}/);
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

  // The harness throws if an icon observer starts before its card is connected.
  // Exercise initial insertion, keyed reuse, and navigation instead of depending
  // on the exact appendChild/insertBefore source spelling.
  const harness = await setupGrid();
  assert.equal(harness.lifecycle.observed.length, 5);
  await harness.instance.refresh();
  await harness.navigate('F');
  assert.equal(harness.lifecycle.observed.some(card => card.data.id === 'F1'), true);
  assert.deepEqual(harness.errors, []);
  assert.doesNotMatch(loadFolderBlock, /BookmarkStore\.resolveSiteIcon\(/);
});

test('website icon cache keeps downloaded bytes permanently and retries failures on a schedule', async () => {
  const store = await read('core/BookmarkStore.js');
  const card = await read('components/BookmarkCard.js');

  const cacheBlock = store.match(/getSiteIconEntry\(url\) \{[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(cacheBlock, /entry\.lastUsedAt = Date\.now\(\);/);
  assert.match(cacheBlock, /return entry;/);
  assert.match(cacheBlock, /return \(entry\.retryAt \|\| 0\) > Date\.now\(\) \? entry : null;/);
  assert.match(store, /SITE_ICON_RETRY_DELAYS = \{ unreachable:/);
  assert.match(store, /SITE_ICON_CACHE_MAX_CHARS/);
  assert.match(card, /label: '重新获取网站图标'/);
  assert.match(card, /BookmarkStore\.clearSiteIcon\(this\.data\.url\)/);
});

test('a website icon that cannot be displayed falls back to the text surface and is not re-downloaded', async () => {
  const card = await read('components/BookmarkCard.js');

  assert.match(card, /image\.addEventListener\('error'/);
  assert.match(card, /handleSiteIconDisplayError\(iconData\)/);
  assert.match(card, /BookmarkStore\.markSiteIconDisplayFailure\(this\.data\.url, iconData\.value\)/);
  assert.match(card, /siteIconRetried/);
  assert.doesNotMatch(card, /handleSiteIconDisplayError\(iconData\) \{[\s\S]{0,400}?clearSiteIcon/);
});

test('applying a saved custom-icon record re-resolves it before assigning image source', async () => {
  const source = await read('components/BookmarkCard.js');

  assert.match(source, /!iconData\.type && \(iconData\.data \|\| iconData\.kind === 'builtin'\)/);
  assert.match(source, /this\.updateIcon\(resolveBookmarkIcon\(this\.data, \{ storage: BookmarkStore \}\)\)/);
});

test('switching icon style updates local icons in place without navigation or selection loss', async () => {
  const h = await setupGrid();
  const card = h.instance.cards.get('A');
  card.data.title = 'GitHub';
  const element = card.element;
  const updates = [];
  card.updateIcon = icon => updates.push(icon);
  h.instance.selectedCards.add('A');
  const before = h.fullOrder();
  h.EventBus.emit('icons:styleChanged');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].iconId, 'github');
  assert.equal(h.instance.cards.get('A').element, element);
  assert.equal(h.instance.selectedCards.has('A'), true);
  assert.deepEqual(h.fullOrder(), before);
  assert.deepEqual(h.errors, []);
});
