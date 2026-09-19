import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

async function read(path) {
  return await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

async function exists(path) {
  try {
    await stat(new URL(`../${path}`, import.meta.url));
    return true;
  } catch {
    return false;
  }
}

test('theme has only light and dark, decided before first paint', async () => {
  const html = await read('index.html');
  const themeInit = await read('theme-init.js');

  const initIndex = html.indexOf('<script src="theme-init.js">');
  const cssIndex = html.indexOf('css/main.css');
  const moduleIndex = html.indexOf('<script type="module" src="main.js">');

  assert.ok(initIndex > -1, 'index.html 需要引入 theme-init.js');
  assert.ok(initIndex < cssIndex, '主题初始化要排在样式表之前');
  assert.ok(initIndex < moduleIndex, '主题初始化要排在模块之前');

  // 经典脚本同步执行，才可能在首次绘制前写好 data-theme
  assert.doesNotMatch(html, /<script type="module" src="theme-init\.js">/);
  assert.match(themeInit, /localStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(themeInit, /prefers-color-scheme: dark/);
  assert.match(themeInit, /document\.documentElement\.dataset\.theme = mode/);
});

test('dark mode is a neutral dark gray with a one step lighter card', async () => {
  const variables = await read('css/modules/variables.css');
  const darkBlock = variables.match(/:root\[data-theme="dark"\] \{[\s\S]*?\n\}/)?.[0] || '';

  assert.ok(darkBlock, '深色令牌要挂在 :root[data-theme="dark"] 上');
  assert.match(darkBlock, /--color-bg: #141414;/);
  assert.match(darkBlock, /--color-surface: #1e1e1e;/);
  assert.match(darkBlock, /color-scheme: dark;/);

  // 主题不再跟随系统媒体查询，避免和手动选择打架
  assert.doesNotMatch(variables, /@media \(prefers-color-scheme: dark\)/);

  const channel = (hex, index) => Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  const bg = darkBlock.match(/--color-bg: (#[0-9a-f]{6});/)[1];
  const surface = darkBlock.match(/--color-surface: (#[0-9a-f]{6});/)[1];
  for (let i = 0; i < 3; i++) {
    const delta = channel(surface, i) - channel(bg, i);
    assert.ok(delta > 0 && delta <= 0x12, `卡片与背景要保持轻度对比，当前通道差 ${delta}`);
  }
});

test('the theme switch replaces every wallpaper entry point', async () => {
  const html = await read('index.html');
  const mainCss = await read('css/main.css');
  const settings = await read('components/SettingsPanel.js');

  assert.match(html, /id="theme-group"[\s\S]*id="theme-light"[\s\S]*id="theme-dark"/);
  assert.doesNotMatch(html, /id="wallpaper"/);
  assert.doesNotMatch(mainCss, /wallpapers\.css/);

  assert.match(settings, /this\.themeKey = 'themeMode'/);
  assert.match(settings, /localStorage\.setItem\(this\.themeKey, mode\)/);
  assert.doesNotMatch(settings, /wallpaper/i);

  assert.equal(await exists('css/modules/wallpapers.css'), false, 'wallpapers.css 应已删除');
  assert.equal(await exists('assets/wallpapers'), false, 'assets/wallpapers 应已删除');
  assert.equal(await exists('docs/silent-index-wallpaper-guide.md'), false, '壁纸专题文档应已删除');
});
