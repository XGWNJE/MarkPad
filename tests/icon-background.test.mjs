import assert from 'node:assert/strict';
import test from 'node:test';

import { backgroundCssValue, iconTextColor, normalizeIconBackground } from '../core/icons/IconBackground.js';
import { analyzeIconEdgePixels } from '../core/icons/IconBackgroundAnalyzer.js';

test('icon backgrounds support only raw, automatic, and explicit solid display strategies', () => {
  assert.deepEqual(normalizeIconBackground({ mode: 'transparent' }), { mode: 'raw' });
  assert.deepEqual(normalizeIconBackground({ mode: 'solid', color: '#AABBCC' }), { mode: 'solid', color: '#aabbcc' });
  assert.deepEqual(normalizeIconBackground({ mode: 'auto', result: { type: 'gradient', colors: ['#112233', '#445566'] } }), {
    mode: 'auto', result: { type: 'gradient', colors: ['#112233', '#445566'], angle: 135 }
  });
});

test('automatic blending produces a solid or gradient from readable edge pixels', () => {
  assert.deepEqual(analyzeIconEdgePixels(Array.from({ length: 10 }, () => [46, 125, 78])), { type: 'solid', color: '#208040' });
  assert.deepEqual(analyzeIconEdgePixels([[255, 0, 0], [0, 255, 0], [0, 0, 255]]), {
    type: 'gradient', colors: ['#ff0000', '#00ff00', '#0000ff'], angle: 135
  });
});

test('automatic complex-edge backgrounds render as gradients and choose a stable text contrast', () => {
  const background = { mode: 'auto', result: { type: 'gradient', colors: ['#111111', '#333333', '#222222'], angle: 135 } };
  assert.match(backgroundCssValue(background), /linear-gradient\(135deg/);
  assert.equal(iconTextColor(background), '#ffffff');
  assert.equal(iconTextColor({ mode: 'solid', color: '#ffffff' }), '#111111');
});
