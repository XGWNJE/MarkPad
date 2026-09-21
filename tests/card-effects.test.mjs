import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function read(path) {
  return await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('gsap loads as a classic script before the module graph', async () => {
  const html = await read('index.html');
  const classicIndex = html.indexOf('<script src="vendor/gsap.min.js">');
  const moduleIndex = html.indexOf('<script type="module" src="main.js">');

  assert.ok(classicIndex > -1, 'index.html 需要加载 vendor/gsap.min.js');
  assert.ok(classicIndex < moduleIndex, 'gsap 必须先于 main.js 模块加载');

  // gsap 的 UMD 在严格模式的模块里会因为给只读的 window.window 赋值而抛错，
  // 模块侧只能通过 vendor/gsap.js 取用，不能再 import UMD 文件。
  const wrapper = await read('vendor/gsap.js');
  assert.match(wrapper, /globalThis\.gsap/);
  assert.doesNotMatch(wrapper, /^import /m);
});

test('card.css removes scan borders, surface glow, particles and ripple while keeping transforms', async () => {
  const cardCss = await read('css/modules/card.css');
  assert.doesNotMatch(cardCss, /card-effect-active::after|card-effect-active::before|\.card-particle|\.card-ripple/);
  assert.match(cardCss, /background: transparent;/);
  assert.match(cardCss, /border: 0;/);
  assert.match(cardCss, /border-radius: var\(--card-radius\)/);

  // 旧的悬停边缘反馈下线：卡片不再用 CSS 改 transform，交给 gsap 接管
  const hoverBlock = cardCss.match(/\.bookmark-card:hover \{[\s\S]*?\}/)?.[0] || '';
  assert.doesNotMatch(hoverBlock, /border-color|box-shadow|transform/);
});

test('the card retains clipping for rounded icon backgrounds without a visual surface layer', async () => {
  const cardCss = await read('css/modules/card.css');
  const cardBlock = cardCss.match(/\.bookmark-card \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(cardBlock, /position: relative;/);
  assert.match(cardBlock, /overflow: hidden;/);
  const wrapper = cardCss.match(/\.card-icon-wrapper \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(wrapper, /overflow: hidden;/);
  assert.match(wrapper, /border-radius: inherit;/);
});

test('CardEffects keeps card tilt and scale wiring but disables removed visuals', async () => {
  const effects = await read('components/CardEffects.js');
  const card = await read('components/BookmarkCard.js');
  const grid = await read('components/BookmarkGrid.js');

  assert.match(effects, /from '\.\.\/vendor\/gsap\.js'/);
  assert.match(effects, /enableStars: false/);
  assert.match(effects, /enableBorderGlow: false/);
  assert.match(effects, /clickEffect: false/);
  assert.match(effects, /scale: 1\.02/);
  assert.match(effects, /clearProps: 'transform'/);
  assert.match(effects, /MOBILE_BREAKPOINT = 768/);
  assert.match(effects, /prefers-reduced-motion/);

  assert.match(card, /CardEffects\.attach\(this\.element\)/);
  assert.match(card, /releaseEffectsTransform\(\)/);
  assert.match(grid, /releaseEffectsTransform\(\)/);
});

test('card light intensity stays bounded and only lights the card under the pointer', async () => {
  // 模块在导入时会建单例：gsap 从 globalThis 取，document/MutationObserver 只在构造里用
  globalThis.gsap = { to() {}, set() {}, killTweensOf() {} };
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  globalThis.document = { documentElement: {} };
  const { distanceToRectEdge, glowFadeDistance, glowIntensity } = await import(
    '../components/CardEffects.js'
  );

  const rect = { left: 100, top: 100, right: 300, bottom: 300, width: 200, height: 200 };

  // 光标在卡片中心：最亮，不会打到满档以外的值
  const center = distanceToRectEdge(200, 200, rect);
  assert.equal(center, 0);
  assert.equal(glowIntensity(center, 80).toFixed(3), '1.000');

  // 柔化距离以外（卡片之间的空隙、网格外）直接归零，不会给背景补光
  assert.equal(glowIntensity(80, 80).toFixed(3), '0.000');
  assert.equal(glowIntensity(300, 80).toFixed(3), '0.000');

  // 曲线单调递减，并且不会越界
  let previous = Infinity;
  for (const distance of [0, 10, 20, 40, 60, 79, 80, 120]) {
    const value = glowIntensity(distance, 80);
    assert.ok(value >= 0 && value <= 1, `强度要在 0-1 之间，当前 ${value}`);
    assert.ok(value <= previous, '强度要随距离单调下降');
    previous = value;
  }

  // 刚好还在柔化范围内：强度落在下限 0.6，边缘不会突然点亮
  assert.equal(glowIntensity(79.999, 80).toFixed(3), '0.600');
  assert.equal(glowIntensity(Number.NaN, 80), 0);

  // 柔化距离有下限，小半径令牌也不会让边缘硬切
  assert.equal(glowFadeDistance(300), 90);
  assert.equal(glowFadeDistance(100), 80);
  assert.equal(glowFadeDistance(Number.NaN), 90);
});
