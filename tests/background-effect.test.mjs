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

test('background effect ports the MoltenMetal shader without adding a runtime dependency', async () => {
  const effect = await read('components/BackgroundEffect.js');
  const pkg = JSON.parse(await read('package.json'));

  // 移植要求：着色器与参数语义保留，渲染层换成原生 WebGL2，不引入 ogl
  assert.match(effect, /#version 300 es/);
  assert.match(effect, /getContext\('webgl2'/);
  assert.doesNotMatch(effect, /from 'ogl'/);
  assert.doesNotMatch(effect, /require\(/);

  for (const uniform of [
    'uSpeed',
    'uScale',
    'uDetail',
    'uGlow',
    'uCoreSize',
    'uSwirl',
    'uFold',
    'uBlackPoint',
    'uBrightness',
    'uColorMode',
    'uGrain',
    'uGrainIntensity',
    'uLightMode'
  ]) {
    assert.match(effect, new RegExp(uniform), `着色器参数 ${uniform} 需要保留`);
  }

  // 原组件里 ogl 的角色由这几步原生调用替代
  assert.match(effect, /drawArrays\(gl\.TRIANGLES, 0, 3\)/);

  assert.equal(pkg.dependencies?.ogl, undefined, 'ogl 不能变成运行时依赖');
  assert.equal(pkg.devDependencies?.ogl, undefined, 'ogl 也不作为 devDependency 引入');
});

test('background effect degrades safely and pauses when hidden', async () => {
  const effect = await read('components/BackgroundEffect.js');

  assert.match(effect, /prefers-reduced-motion: reduce/);
  assert.match(effect, /IntersectionObserver/);
  assert.match(effect, /visibilitychange/);
  assert.match(effect, /webglcontextlost/);
  assert.match(effect, /background-effect-canvas/);
  // 投影上限，避免高分屏把 GPU 打满
  assert.match(effect, /MAX_DPR = 1\.5/);

  const css = await read('css/modules/background-effect.css');
  assert.match(css, /\.background-effect-layer \{/);
  assert.match(css, /z-index: -1/);
  assert.match(css, /pointer-events: none/);

  const mainCss = await read('css/main.css');
  assert.match(mainCss, /background-effect\.css/, '背景光效样式要进 css/main.css');
});

test('background effect recreates WebGL resources after a context reset', async () => {
  const effect = await read('components/BackgroundEffect.js');
  const restoredStart = effect.lastIndexOf('this.handleContextRestored = () => {');
  const restored = restoredStart >= 0 ? effect.slice(restoredStart, effect.indexOf('\n      };', restoredStart) + 8) : '';

  assert.match(effect, /createRenderResources\(\)/);
  assert.match(restored, /this\.createRenderResources\(\);/);
  assert.match(restored, /this\.contextLost = false;/);
  assert.match(restored, /catch \(error\)/);
});

test('light and dark themes both define background effect colors', async () => {
  const variables = await read('css/modules/variables.css');

  for (const token of [
    '--background-effect-bg',
    '--background-effect-color1',
    '--background-effect-color2',
    '--background-effect-color3'
  ]) {
    assert.equal(
      (variables.match(new RegExp(`${token}:`, 'g')) || []).length,
      2,
      `${token} 需要在亮色和暗色主题各定义一次`
    );
  }

  const darkBlock = variables.match(/:root\[data-theme="dark"\] \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(darkBlock, /--background-effect-bg: #141414;/);
});

test('the settings menu owns the background effect switch and strength', async () => {
  const html = await read('index.html');
  const settings = await read('components/SettingsPanel.js');

  assert.match(html, /id="background-effect-layer"/);
  assert.match(html, /id="background-effect-group"/);
  assert.match(html, /id="background-effect-on"/);
  assert.match(html, /id="background-effect-off"/);
  assert.match(html, /id="background-effect-strength"/);

  assert.match(settings, /this\.backgroundEffectKey = 'backgroundEffect'/);
  assert.match(settings, /this\.backgroundEffectStrengthKey = 'backgroundEffectStrength'/);
  assert.match(settings, /this\.backgroundEffect\?\.setTheme\(mode\)/);
  assert.match(settings, /new BackgroundEffect\(/);
});

test('the ported effect stays a single self-contained component', async () => {
  assert.equal(await exists('components/MoltenMetal.jsx'), false, '本仓库没有 React，不引入 jsx 组件');
  assert.equal(await exists('components/MoltenMetal.css'), false);
});
