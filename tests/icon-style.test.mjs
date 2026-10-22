import assert from 'node:assert/strict';
import test from 'node:test';
import { getIconStyle, setIconStyle, ICON_STYLE_KEY } from '../core/icons/IconStyle.js';
import { buildIconPrompt } from '../core/icons/IconPrompt.js';
import { resolveBookmarkIcon } from '../core/icons/IconResolver.js';

test('clay is the default and icon-style selection persists independently of light/dark', () => {
  const values = new Map([['themeMode', 'dark']]);
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  assert.equal(getIconStyle(storage), 'clay');
  assert.equal(setIconStyle('flat', storage), true);
  assert.equal(getIconStyle(storage), 'flat');
  assert.equal(values.get('themeMode'), 'dark');
  assert.equal(setIconStyle('glass', storage), false);
  assert.equal(values.get(ICON_STYLE_KEY), 'flat');
});

test('a manual built-in choice follows style changes without copying asset URLs to storage', () => {
  const record = { kind: 'builtin', iconId: 'visionguard', scale: 1.25 };
  const storage = { getCustomIcon: () => record };
  const bookmark = { id: '1', title: '控制台', url: 'https://private.test/?secret=not-used' };
  const clay = resolveBookmarkIcon(bookmark, { storage, style: 'clay' });
  const flat = resolveBookmarkIcon(bookmark, { storage, style: 'flat' });
  assert.equal(clay.iconId, 'visionguard');
  assert.equal(flat.iconId, 'visionguard');
  assert.ok(clay.value.endsWith('/clay/visionguard.png'));
  assert.ok(flat.value.endsWith('/flat/visionguard.svg'));
  assert.equal(flat.scale, 1.25);
  assert.equal(clay.matchReason, 'user-selected');
  assert.deepEqual(record, { kind: 'builtin', iconId: 'visionguard', scale: 1.25 });
});

test('removing a manual choice restores the current name match or the website fallback', () => {
  const storage = { getCustomIcon: () => null };
  assert.equal(resolveBookmarkIcon({ id: '1', title: 'GitHub', url: 'https://example.test' }, { storage, style: 'flat' }).iconId, 'github');
  assert.equal(resolveBookmarkIcon({ id: '2', title: '控制台', url: 'https://private.test' }, { storage }), null);
});

test('single-icon prompts preserve identity and each material contract without including URLs', () => {
  const clay = buildIconPrompt('新品牌', 'clay');
  const flat = buildIconPrompt('新品牌', 'flat');
  assert.match(clay, /ONE MarkPad/);
  assert.match(clay, /real alpha channel/);
  assert.match(clay, /72–76%/);
  assert.match(clay, /256 × 256/);
  assert.match(flat, /editable SVG/);
  assert.match(flat, /#f5f3ed/);
  assert.doesNotMatch(flat, /matte polymer clay/);
  assert.doesNotMatch(clay + flat, /https?:\/\//);
  const privateTitle = buildIconPrompt('https://private.test/path?token=private-value', 'clay');
  assert.doesNotMatch(privateTitle, /private\.test|private-value|token=/);
  const folder = buildIconPrompt('工作', 'clay', 'folder');
  assert.match(folder, /gray-green #7c8b88 folder/);
  assert.match(folder, /Change only the badge/);
});
