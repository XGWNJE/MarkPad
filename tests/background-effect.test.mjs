import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { Element } from './helpers/grid-harness.mjs';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

async function setupSettings(legacy = {}, { reducedMotion = false } = {}) {
  const [source, busSource, html] = await Promise.all([
    read('components/SettingsPanel.js'), read('core/EventBus.js'), read('index.html')
  ]);
  const stored = new Map(Object.entries({
    themeMode: 'dark', headerOpacity: '82', cardSize: '160', cardRadius: '20',
    gridPageMargin: '36', cardGap: '32', cardFontFamily: 'yahei',
    cardTitleSize: '20', cardTitleTracking: '4', openMode: 'current',
    custom_icon_cache: '{"keep":"custom"}', site_icon_cache_v2: '{"keep":"website"}',
    ...legacy
  }));
  const before = new Map(stored);
  const reads = [];
  const writes = [];
  const localStorage = {
    getItem(key) { reads.push(key); return stored.get(key) ?? null; },
    setItem(key, value) { writes.push(key); stored.set(key, String(value)); },
    removeItem(key) { throw new Error(`Unexpected removal of preference ${key}`); },
    clear() { throw new Error('Preferences must remain intact'); }
  };
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, new Element()]));
  const root = new Element('html');
  root.dataset.theme = 'dark';
  const document = new Element('document');
  Object.assign(document, {
    hidden: false, documentElement: root,
    getElementById: id => elements.get(id) || null,
    querySelector: () => null
  });
  const activity = { canvases: 0, webgl: 0, observers: 0, frames: 0, timers: 0 };
  document.createElement = tag => {
    if (tag === 'canvas') activity.canvases++;
    const node = new Element(tag);
    node.getContext = kind => { if (String(kind).startsWith('webgl')) activity.webgl++; return null; };
    return node;
  };
  const frames = new Map();
  let frameId = 0;
  const requestAnimationFrame = callback => { activity.frames++; frames.set(++frameId, callback); return frameId; };
  const cancelAnimationFrame = id => frames.delete(id);
  const window = new Element('window');
  Object.assign(window, {
    document, innerWidth: 2560, innerHeight: 1440, devicePixelRatio: 1.5,
    matchMedia: () => ({ matches: reducedMotion, addEventListener() {}, removeEventListener() {} }),
    requestAnimationFrame, cancelAnimationFrame
  });
  class Observer {
    constructor() { activity.observers++; }
    observe() {}
    disconnect() {}
  }
  const context = vm.createContext({
    window, document, localStorage, console, requestAnimationFrame, cancelAnimationFrame,
    ResizeObserver: Observer, IntersectionObserver: Observer,
    setTimeout() { activity.timers++; return 1; }, clearTimeout() {}
  });
  vm.runInContext(`globalThis.EventBus = (() => { ${busSource.replace('export default new EventBus();', 'return new EventBus();')} })()`, context);
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, '').replace('export default SettingsPanel;', 'globalThis.SettingsPanel = SettingsPanel;'), context);
  const panel = vm.runInContext('new SettingsPanel()', context);
  const dispatch = (node, type, event = {}) => {
    for (const handler of node.listeners.get(type) || []) handler({ target: node, ...event });
  };
  const input = (id, value, type = 'input') => {
    const node = elements.get(id);
    assert.ok(node, `Control ${id} must exist`);
    node.value = value;
    dispatch(node, type);
  };
  const clickTheme = value => {
    const button = elements.get(`theme-${value}`);
    button.dataset.value = value;
    button.closest = selector => selector === '.menu-toggle-btn' ? button : null;
    dispatch(elements.get('theme-group'), 'click', { target: button });
  };
  const idle = () => {
    for (let tick = 0; tick < 30; tick++) {
      for (const [id, callback] of [...frames]) { frames.delete(id); callback(tick * 16); }
    }
  };
  return { panel, document, window, root, stored, before, reads, writes, activity, frames, dispatch, input, clickTheme, idle };
}

const legacyCases = [
  ['missing', {}],
  ['enabled', { backgroundEffect: 'on', backgroundEffectStrength: '70' }],
  ['disabled', { backgroundEffect: 'off', backgroundEffectStrength: '20' }],
  ['maximum', { backgroundEffect: 'on', backgroundEffectStrength: '100' }],
  ['invalid', { backgroundEffect: 'unexpected', backgroundEffectStrength: 'not-a-number' }]
];

for (const [name, legacy] of legacyCases) {
  for (const reducedMotion of [false, true]) {
    test(`static background ignores ${name} effect preferences with reduced motion ${reducedMotion}`, async () => {
      const h = await setupSettings(legacy, { reducedMotion });
      assert.deepEqual(h.stored, h.before, 'Initialization must preserve existing preferences and icon caches');
      assert.equal(h.root.dataset.theme, 'dark');
      assert.equal(h.root.style.getPropertyValue('--toolbar-alpha'), '0.82');
      assert.equal(h.root.style.getPropertyValue('--card-size'), '160px');
      assert.equal(h.root.style.getPropertyValue('--card-radius'), '20px');
      assert.equal(h.root.style.getPropertyValue('--card-title-size'), '20px');
      assert.equal(h.root.style.getPropertyValue('--card-title-tracking'), '0.04em');
      assert.equal(h.root.style.getPropertyValue('--grid-page-margin'), '36px');
      assert.equal(h.root.style.getPropertyValue('--card-gap'), '32px');
      assert.ok(h.reads.every(key => !key.startsWith('backgroundEffect')), 'Legacy effect values must not affect startup');
      h.clickTheme('light');
      assert.equal(h.root.dataset.theme, 'light');
      assert.equal(h.stored.get('themeMode'), 'light');
      h.clickTheme('dark');
      assert.equal(h.root.dataset.theme, 'dark');
      assert.deepEqual(h.stored, h.before);
      h.document.hidden = true;
      h.dispatch(h.document, 'visibilitychange');
      h.document.hidden = false;
      h.dispatch(h.document, 'visibilitychange');
      h.dispatch(h.window, 'resize');
      h.idle();
      assert.deepEqual(h.activity, { canvases: 0, webgl: 0, observers: 0, frames: 0, timers: 0 });
      assert.equal(h.frames.size, 0, 'Settings must not own an idle rendering loop');
    });
  }
}

test('existing appearance controls keep working without reading or rewriting legacy effect values', async () => {
  const legacy = { backgroundEffect: 'on', backgroundEffectStrength: '85' };
  const h = await setupSettings(legacy);
  h.input('header-opacity', '90');
  h.input('card-size', '180');
  h.input('card-radius', '24');
  h.input('grid-page-margin', '40');
  h.input('card-gap', '36');
  h.input('card-title-size', '18');
  h.input('card-title-tracking', '2');
  h.input('card-font-family', 'serif', 'change');
  assert.equal(h.root.style.getPropertyValue('--toolbar-alpha'), '0.90');
  assert.equal(h.root.style.getPropertyValue('--card-size'), '180px');
  assert.equal(h.root.style.getPropertyValue('--card-radius'), '24px');
  assert.equal(h.root.style.getPropertyValue('--grid-page-margin'), '40px');
  assert.equal(h.root.style.getPropertyValue('--card-gap'), '36px');
  assert.equal(h.root.style.getPropertyValue('--card-title-size'), '18px');
  assert.equal(h.root.style.getPropertyValue('--card-meta-size'), '14px');
  assert.equal(h.root.style.getPropertyValue('--card-title-tracking'), '0.02em');
  assert.match(h.root.style.getPropertyValue('--font-family'), /Noto Serif SC/);
  for (const [key, value] of Object.entries(legacy)) assert.equal(h.stored.get(key), value);
  assert.ok([...h.reads, ...h.writes].every(key => !key.startsWith('backgroundEffect')));
  assert.equal(h.stored.get('openMode'), 'current');
  assert.equal(h.stored.get('custom_icon_cache'), h.before.get('custom_icon_cache'));
  assert.equal(h.stored.get('site_icon_cache_v2'), h.before.get('site_icon_cache_v2'));
  h.idle();
  assert.deepEqual(h.activity, { canvases: 0, webgl: 0, observers: 0, frames: 0, timers: 0 });
});

test('the shipped page uses a static theme surface with no independent rendering entry point', async () => {
  const [html, settings, mainCss, baseCss] = await Promise.all([
    read('index.html'), read('components/SettingsPanel.js'), read('css/main.css'), read('css/modules/base.css')
  ]);
  assert.doesNotMatch(html, /background-effect|<canvas\b/);
  assert.doesNotMatch(settings, /BackgroundEffect|backgroundEffect|requestAnimationFrame|getContext/);
  assert.doesNotMatch(mainCss, /background-effect/);
  assert.match(baseCss, /body\s*\{[\s\S]*?background:\s*var\(--color-bg\);/);
  assert.match(html, /id="menu-panel"[^>]*\binert\b[^>]*aria-hidden="true"/);
  await assert.rejects(stat(new URL('../components/BackgroundEffect.js', import.meta.url)), { code: 'ENOENT' });
  await assert.rejects(stat(new URL('../css/modules/background-effect.css', import.meta.url)), { code: 'ENOENT' });
});
