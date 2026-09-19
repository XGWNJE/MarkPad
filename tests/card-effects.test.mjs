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

test('card.css replaces the old hover edge style with the token driven glow', async () => {
  const variables = await read('css/modules/variables.css');
  const cardCss = await read('css/modules/card.css');

  assert.match(variables, /--card-glow-rgb:/);
  assert.match(variables, /--card-glow-peak:/);
  assert.match(variables, /--card-spotlight-blend:/);
  assert.equal(
    (variables.match(/--card-glow-rgb:/g) || []).length,
    2,
    '亮色和暗色主题都要定义光晕颜色'
  );

  assert.match(cardCss, /\.bookmark-card\.card-effect-active::after/);
  assert.match(cardCss, /calc\(var\(--glow-intensity\) \* var\(--card-glow-peak\)\)/);
  assert.match(cardCss, /\.card-spotlight \{/);
  assert.match(cardCss, /\.card-particle \{/);
  assert.match(cardCss, /\.card-ripple \{/);

  // 旧的悬停边缘反馈下线：卡片不再用 CSS 改 transform，交给 gsap 接管
  const hoverBlock = cardCss.match(/\.bookmark-card:hover \{[\s\S]*?\}/)?.[0] || '';
  assert.doesNotMatch(hoverBlock, /border-color|box-shadow|transform/);
});

test('CardEffects wires glow, spotlight, tilt and ripple onto real cards', async () => {
  const effects = await read('components/CardEffects.js');
  const card = await read('components/BookmarkCard.js');
  const grid = await read('components/BookmarkGrid.js');

  assert.match(effects, /from '\.\.\/vendor\/gsap\.js'/);
  assert.match(effects, /--glow-intensity/);
  assert.match(effects, /clearProps: 'transform'/);
  assert.match(effects, /MOBILE_BREAKPOINT = 768/);
  assert.match(effects, /prefers-reduced-motion/);
  assert.match(effects, /card-ripple/);

  assert.match(card, /CardEffects\.attach\(this\.element\)/);
  assert.match(card, /releaseEffectsTransform\(\)/);
  assert.match(grid, /releaseEffectsTransform\(\)/);
});
