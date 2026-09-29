import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('new tab explicitly declares MarkPad tab-icon assets', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));

  assert.match(indexHtml, /<link rel="icon" type="image\/svg\+xml" sizes="any" href="icons\/tab-icon\.svg">/);
  assert.match(indexHtml, /<link rel="icon" type="image\/png" sizes="48x48" href="icons\/icon48\.png">/);
  assert.equal(manifest.icons['16'], 'icons/icon16.png');
  assert.equal(manifest.icons['48'], 'icons/icon48.png');
});

test('header keeps settings while creation actions belong to the grid', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const headerHtml = html.match(/<header[\s\S]*?<\/header>/)?.[0] || '';
  const menuHtml = html.match(/<div id="menu-panel"[\s\S]*?<!-- 编辑书签弹窗 -->/)?.[0] || '';
  const breadcrumbCss = await readFile(new URL('../css/modules/breadcrumb.css', import.meta.url), 'utf8');
  const iconLibrary = await readFile(new URL('../core/IconLibrary.js', import.meta.url), 'utf8');
  const gridCss = await readFile(new URL('../css/modules/grid.css', import.meta.url), 'utf8');
  const toolbarCss = await readFile(new URL('../css/modules/toolbar.css', import.meta.url), 'utf8');
  const settingsPanel = await readFile(new URL('../components/SettingsPanel.js', import.meta.url), 'utf8');
  const cardCss = await readFile(new URL('../css/modules/card.css', import.meta.url), 'utf8');
  const mainJs = await readFile(new URL('../main.js', import.meta.url), 'utf8');

  assert.doesNotMatch(headerHtml, /id="btn-new-bookmark"|id="btn-new-folder"/);
  assert.doesNotMatch(html, /btn-search|quick-find|快速查找|Ctrl\+F/);
  assert.doesNotMatch(mainJs, /QuickFind|toolbar:search|btn-search|quick-find/);
  assert.match(headerHtml, /id="menu-trigger"[^>]*class="[^"]*toolbar-icon-btn/);
  assert.match(headerHtml, /id="menu-trigger"[\s\S]*data-icon="settings"/);
  assert.doesNotMatch(headerHtml, /<span class="toolbar-label">/);

  assert.match(menuHtml, /<div class="menu-panel-title">设置<\/div>/);
  assert.doesNotMatch(menuHtml, /常用操作|menu-new-bookmark|menu-new-folder/);

  assert.match(breadcrumbCss, /\.breadcrumb\s*\{[\s\S]*?flex:\s*0 1 auto;/);
  assert.match(breadcrumbCss, /\.breadcrumb\s*\{[\s\S]*?width:\s*fit-content;/);
  assert.match(breadcrumbCss, /\.breadcrumb\s*\{[\s\S]*?background:\s*transparent;/);
  assert.match(breadcrumbCss, /\.breadcrumb-item\.active\s*\{[\s\S]*?background:\s*transparent;/);
  assert.match(breadcrumbCss, /\.breadcrumb-item\s*\{[\s\S]*?min-height:\s*44px;/);
  assert.match(breadcrumbCss, /\.breadcrumb-item\s*\{[\s\S]*?font-size:\s*var\(--font-size-md\);/);

  assert.match(iconLibrary, /Lucide/);
  assert.match(iconLibrary, /settings:\s*\[[\s\S]*?<path d="M9\.671 4\.136/);

  assert.doesNotMatch(gridCss, /mask-image:\s*linear-gradient/);
  assert.doesNotMatch(gridCss, /-webkit-mask-image:\s*linear-gradient/);
  assert.doesNotMatch(gridCss.match(/\.content\s*\{[\s\S]*?\}/)?.[0] || '', /padding-top/);
  assert.doesNotMatch(gridCss.match(/@media \(max-width: 768px\)\s*\{[\s\S]*?\.content\s*\{[\s\S]*?\}/)?.[0] || '', /padding-top/);
  assert.match(gridCss, /\.grid-scroll\s*\{[\s\S]*?box-sizing:\s*border-box;[\s\S]*?padding:\s*calc\(var\(--toolbar-height\) \+ var\(--grid-page-margin\)\) var\(--grid-page-margin\) var\(--grid-page-margin\);/);
  assert.match(gridCss, /\.grid-scroll-inner\s*\{[\s\S]*?width:\s*min\(100%, 1200px\);/);
  assert.match(toolbarCss, /height:\s*var\(--toolbar-height\);/);
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
  assert.doesNotMatch(menuHtml, /id="card-title-weight"/);
  assert.doesNotMatch(settingsPanel, /cardTitleWeight|currentCardTitleWeight|--card-title-weight/);
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
