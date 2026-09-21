import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

class FakeElement {
  constructor(id) {
    this.id = id;
    this.listeners = new Map();
  }

  addEventListener(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(callback);
  }

  click() {
    for (const callback of this.listeners.get('click') || []) {
      callback({ target: this });
    }
  }
}

function installBrowserStubs(elementIds) {
  const elements = new Map(elementIds.map(id => [id, new FakeElement(id)]));

  globalThis.document = {
    getElementById(id) {
      return elements.get(id) || null;
    }
  };

  globalThis.location = { href: 'chrome-extension://markpad/index.html' };
  globalThis.history = {
    replaceState() {},
    pushState() {},
    back() {}
  };
  globalThis.window = {
    addEventListener() {}
  };

  return elements;
}

test('toolbar uses menu action items for creation and icon search trigger', async () => {
  const elements = installBrowserStubs([
    'toolbar',
    'btn-search',
    'menu-new-bookmark',
    'menu-new-folder'
  ]);

  const EventBus = (await import('../core/EventBus.js')).default;
  const Toolbar = (await import('../components/Toolbar.js')).default;
  const emitted = [];

  EventBus.on('toolbar:newBookmark', () => emitted.push('toolbar:newBookmark'));
  EventBus.on('toolbar:newFolder', () => emitted.push('toolbar:newFolder'));
  EventBus.on('toolbar:search', () => emitted.push('toolbar:search'));

  new Toolbar();
  elements.get('menu-new-bookmark').click();
  elements.get('menu-new-folder').click();
  elements.get('btn-search').click();

  assert.deepEqual(emitted, [
    'toolbar:newBookmark',
    'toolbar:newFolder',
    'toolbar:search'
  ]);
});

test('new tab explicitly declares MarkPad tab-icon assets', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));

  assert.match(indexHtml, /<link rel="icon" type="image\/svg\+xml" sizes="any" href="icons\/tab-icon\.svg">/);
  assert.match(indexHtml, /<link rel="icon" type="image\/png" sizes="48x48" href="icons\/icon48\.png">/);
  assert.equal(manifest.icons['16'], 'icons/icon16.png');
  assert.equal(manifest.icons['48'], 'icons/icon48.png');
});

test('header keeps creation actions inside the settings menu', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const headerHtml = html.match(/<header[\s\S]*?<\/header>/)?.[0] || '';
  const menuHtml = html.match(/<div id="menu-panel"[\s\S]*?<!-- 快速查找弹窗 -->/)?.[0] || '';
  const breadcrumbCss = await readFile(new URL('../css/modules/breadcrumb.css', import.meta.url), 'utf8');
  const iconLibrary = await readFile(new URL('../core/IconLibrary.js', import.meta.url), 'utf8');
  const gridCss = await readFile(new URL('../css/modules/grid.css', import.meta.url), 'utf8');
  const toolbarCss = await readFile(new URL('../css/modules/toolbar.css', import.meta.url), 'utf8');
  const settingsPanel = await readFile(new URL('../components/SettingsPanel.js', import.meta.url), 'utf8');
  const cardCss = await readFile(new URL('../css/modules/card.css', import.meta.url), 'utf8');
  const mainJs = await readFile(new URL('../main.js', import.meta.url), 'utf8');

  assert.doesNotMatch(headerHtml, /id="btn-new-bookmark"|id="btn-new-folder"/);
  assert.match(headerHtml, /id="btn-search"[^>]*class="[^"]*toolbar-icon-btn/);
  assert.match(headerHtml, /id="menu-trigger"[^>]*class="[^"]*toolbar-icon-btn/);
  assert.match(headerHtml, /id="menu-trigger"[\s\S]*data-icon="settings"/);
  assert.doesNotMatch(headerHtml, /<span class="toolbar-label">/);

  assert.match(menuHtml, /<div class="menu-panel-title">设置<\/div>/);
  assert.match(menuHtml, /<div class="menu-section-label">常用操作<\/div>/);
  assert.match(menuHtml, /id="menu-new-bookmark"/);
  assert.match(menuHtml, /id="menu-new-folder"/);

  assert.match(breadcrumbCss, /\.breadcrumb\s*\{[\s\S]*?flex:\s*0 1 auto;/);
  assert.match(breadcrumbCss, /\.breadcrumb\s*\{[\s\S]*?width:\s*fit-content;/);
  assert.match(breadcrumbCss, /\.breadcrumb\s*\{[\s\S]*?background:\s*transparent;/);
  assert.match(breadcrumbCss, /\.breadcrumb-item\.active\s*\{[\s\S]*?background:\s*transparent;/);
  assert.match(breadcrumbCss, /\.breadcrumb-item\s*\{[\s\S]*?min-height:\s*44px;/);
  assert.match(breadcrumbCss, /\.breadcrumb-item\s*\{[\s\S]*?font-size:\s*15px;/);

  assert.match(iconLibrary, /Lucide/);
  assert.match(iconLibrary, /search:\s*\[[\s\S]*?<path d="m21 21-4\.34-4\.34"\/>/);
  assert.match(iconLibrary, /settings:\s*\[[\s\S]*?<path d="M9\.671 4\.136/);

  assert.doesNotMatch(gridCss, /mask-image:\s*linear-gradient/);
  assert.doesNotMatch(gridCss, /-webkit-mask-image:\s*linear-gradient/);
  assert.doesNotMatch(gridCss.match(/\.content\s*\{[\s\S]*?\}/)?.[0] || '', /padding-top/);
  assert.doesNotMatch(gridCss.match(/@media \(max-width: 768px\)\s*\{[\s\S]*?\.content\s*\{[\s\S]*?\}/)?.[0] || '', /padding-top/);
  assert.match(gridCss, /\.grid-scroll\s*\{[\s\S]*?box-sizing:\s*border-box;[\s\S]*?padding:\s*calc\(64px \+ var\(--grid-page-margin\)\) var\(--grid-page-margin\) var\(--grid-page-margin\);/);
  assert.match(gridCss, /\.grid-scroll-inner\s*\{[\s\S]*?width:\s*min\(100%, 1200px\);/);
  assert.match(gridCss, /@media \(max-width: 768px\)\s*\{[\s\S]*?\.grid-scroll\s*\{[\s\S]*?padding-top:\s*calc\(60px \+ var\(--grid-page-margin\)\);/);
  assert.match(gridCss, /grid-template-columns:\s*repeat\(auto-fill, minmax\(min\(100%, var\(--card-width\)\), var\(--card-width\)\)\);/);
  assert.match(gridCss, /justify-content:\s*center;/);

  assert.match(menuHtml, /<div class="menu-section-label">主题<\/div>/);
  assert.match(menuHtml, /<div class="menu-section-label">书签卡片<\/div>/);
  assert.match(menuHtml, /<div class="menu-section-label">顶部栏<\/div>/);
  assert.match(menuHtml, /id="header-opacity"/);
  assert.match(menuHtml, /id="card-size"[^>]*min="80"[^>]*max="200"[^>]*step="20"/);
  assert.match(menuHtml, /id="card-radius"/);
  assert.match(menuHtml, /id="grid-page-margin"/);
  assert.match(menuHtml, /id="card-gap"[^>]*min="8"[^>]*max="64"[^>]*step="4"/);
  assert.match(menuHtml, /id="card-font-family"/);
  assert.match(menuHtml, /id="card-title-size"/);
  assert.match(menuHtml, /id="card-title-weight"/);
  assert.match(menuHtml, /id="card-title-tracking"/);
  assert.match(menuHtml, /id="theme-group"[\s\S]*data-value="light"[\s\S]*data-value="dark"/);
  // 卡片文字改为悬停展开，设置里的显示/隐藏开关已移除
  assert.doesNotMatch(menuHtml, /id="card-text-group"/);
  assert.doesNotMatch(menuHtml, /id="card-text-on"/);
  // 壁纸入口和控件已整体移除
  assert.doesNotMatch(menuHtml, /id="wallpaper-grid"|id="wallpaper"|wallpaper-brightness/);
  assert.match(toolbarCss, /--toolbar-alpha/);
  assert.match(settingsPanel, /headerOpacityKey/);
  assert.match(settingsPanel, /cardRadiusKey/);
  assert.match(settingsPanel, /cardFontFamilyKey/);
  assert.match(settingsPanel, /gridPageMarginKey/);
  assert.match(settingsPanel, /setGridPageMargin/);
  assert.match(settingsPanel, /cardGapKey/);
  assert.match(settingsPanel, /setCardGap/);
  assert.match(gridCss, /gap:\s*var\(--card-gap\);/);
  assert.match(settingsPanel, /applyCardTypography/);
  assert.match(settingsPanel, /getCardRadiusLimit\(\)/);
  assert.match(settingsPanel, /getBoundingClientRect\(\)\.width/);
  assert.match(settingsPanel, /settings:adjustCardSize/);
  assert.doesNotMatch(settingsPanel, /wallpaper/i);
  assert.match(cardCss, /--card-radius/);
  assert.match(cardCss, /--card-font-family/);
  assert.match(cardCss, /-webkit-font-smoothing: antialiased/);
  assert.match(cardCss, /font-synthesis: none/);
  assert.match(mainJs, /EventBus\.emit\('settings:adjustCardSize', direction\)/);
  assert.match(settingsPanel, /--toolbar-opacity/);
});
