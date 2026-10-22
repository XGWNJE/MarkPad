import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { BUILTIN_ICON_CATALOG } from '../core/icons/BuiltinIconCatalog.js';
import { sanitizeSvg } from '../core/icons/IconSanitizer.js';

test('every reviewed identity ships a safe flat SVG and a 256px alpha PNG', async () => {
  for (const icon of BUILTIN_ICON_CATALOG) {
    const svg = (await fs.readFile(new URL(`../assets/bookmark-icons/flat/${icon.id}.svg`, import.meta.url), 'utf8')).trim();
    assert.equal(sanitizeSvg(svg), svg, `${icon.id}: unsafe SVG`);
    assert.match(svg, /viewBox="0 0 256 256"/);
    assert.doesNotMatch(svg, /<text\b|<image\b|<use\b/i, `${icon.id}: editable standalone paths required`);
    const png = await fs.readFile(new URL(`../assets/bookmark-icons/clay/${icon.id}.png`, import.meta.url));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${icon.id}: PNG signature`);
    assert.equal(png.readUInt32BE(16), 256, `${icon.id}: width`);
    assert.equal(png.readUInt32BE(20), 256, `${icon.id}: height`);
    assert.equal(png[25], 6, `${icon.id}: RGBA alpha channel`);
    assert.ok(png.length < 1024 * 1024, `${icon.id}: upload size limit`);
  }
});
