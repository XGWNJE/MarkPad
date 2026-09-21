import assert from 'node:assert/strict';
import test from 'node:test';

import { isSvgRaw, sanitizeSvg } from '../core/icons/IconSanitizer.js';

test('sanitizeSvg keeps safe SVG markup', () => {
  const clean = sanitizeSvg('<svg viewBox="0 0 24 24"><path fill="currentColor" d="M1 1h22v22H1z"/></svg>');

  assert.match(clean, /^<svg\b/);
  assert.match(clean, /viewBox="0 0 24 24"/);
  assert.match(clean, /<path\b/);
  assert.match(clean, /fill="currentColor"/);
});

test('sanitizeSvg rejects non-SVG input', () => {
  assert.equal(sanitizeSvg('<div>not svg</div>'), null);
  assert.equal(sanitizeSvg(''), null);
  assert.equal(sanitizeSvg(null), null);
});

test('sanitizeSvg removes executable and embedded elements', () => {
  const clean = sanitizeSvg(`
    <svg viewBox="0 0 24 24">
      <script>alert(1)</script>
      <foreignObject><body>bad</body></foreignObject>
      <image href="https://example.com/a.png" />
      <path d="M0 0h24v24H0z"/>
    </svg>
  `);

  assert.doesNotMatch(clean, /script|foreignObject|image/i);
  assert.match(clean, /<path\b/);
});

test('sanitizeSvg removes event handlers and unsafe URL attributes', () => {
  const clean = sanitizeSvg(`
    <svg viewBox="0 0 24 24" onclick="alert(1)">
      <path onmouseover="alert(2)" href="https://example.com/icon" xlink:href="javascript:alert(3)" d="M0 0h24v24H0z"/>
    </svg>
  `);

  assert.doesNotMatch(clean, /onclick|onmouseover|xlink:href|javascript:|https:\/\/example\.com/i);
  assert.match(clean, /<path\b/);
});

test('sanitizeSvg removes unsafe style attributes', () => {
  const clean = sanitizeSvg('<svg viewBox="0 0 24 24"><path style="fill:url(https://example.com/a.svg#x)" d="M0 0h24v24H0z"/></svg>');

  assert.doesNotMatch(clean, /style=|url\(/i);
  assert.match(clean, /<path\b/);
});

test('sanitizeSvg preserves safe SMIL animation elements', () => {
  const clean = sanitizeSvg('<svg viewBox="0 0 24 24"><circle r="4"><animate attributeName="r" values="2;4;2" dur="1s" repeatCount="indefinite"/></circle></svg>');

  assert.match(clean, /<animate\b/);
  assert.match(clean, /attributeName="r"/);
});

test('isSvgRaw only accepts raw SVG strings', () => {
  assert.equal(isSvgRaw('<svg></svg>'), true);
  assert.equal(isSvgRaw('  <svg></svg>'), true);
  assert.equal(isSvgRaw('data:image/png;base64,abc'), false);
  assert.equal(isSvgRaw(null), false);
});
