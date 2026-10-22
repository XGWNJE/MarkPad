import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { BUILTIN_ICON_CATALOG as catalog } from '../../core/icons/BuiltinIconCatalog.js';
import { sanitizeSvg } from '../../core/icons/IconSanitizer.js';
import { findLibraryIcon } from '../../core/icons/IconLibraryProvider.js';
import { sharp, root, flatDir, clayDir } from './asset-tools.mjs';

const checks = [];
for (const icon of catalog) {
  const svg = (await fs.readFile(path.join(flatDir, `${icon.id}.svg`), 'utf8')).trim();
  assert.equal(sanitizeSvg(svg), svg, `${icon.id}: SVG sanitizer`);
  await sharp(Buffer.from(svg)).resize(64, 64).png().toBuffer();
  const png = path.join(clayDir, `${icon.id}.png`);
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 256); assert.equal(info.height, 256);
  const alpha = (x, y) => data[(y * info.width + x) * 4 + 3];
  const corners = [alpha(0, 0), alpha(255, 0), alpha(0, 255), alpha(255, 255)];
  assert.ok(corners.every(a => a <= 2), `${icon.id}: transparent corners`);
  let clear = 0, solid = 0, outerStrong = 0;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const a = alpha(x, y);
    if (a === 0) clear++;
    if (a >= 128) solid++;
    if (a >= 128 && (x < 16 || y < 16 || x >= 240 || y >= 240)) outerStrong++;
  }
  assert.ok(clear / 65536 > .3, `${icon.id}: true transparency`);
  assert.ok(solid / 65536 > .02, `${icon.id}: visible mark`);
  assert.equal(outerStrong, 0, `${icon.id}: subject too close to crop boundary`);
  checks.push({ id: icon.id, corners, transparent: +(clear / 65536).toFixed(3), solid: +(solid / 65536).toFixed(3), bytes: (await fs.stat(png)).size });
}

const exportPath = process.argv[2];
let coverage;
if (exportPath) {
  const raw = await fs.readFile(exportPath, 'utf8');
  const names = [...raw.matchAll(/<A\b[^>]*>([\s\S]*?)<\/A>/gi)].map(match => match[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"'));
  const manualIds = new Map([['控制台', 'visionguard'], ['服务器 - 轻量云 - 控制台', 'tencentcloud'], ['AI 3D模型生成器', 'tripo']]);
  const manual = names.filter(title => !findLibraryIcon({ title, url: 'https://example.invalid/' }));
  assert.equal(names.length, 98);
  assert.equal(manual.length, 3);
  assert.ok(manual.every(title => manualIds.has(title)));
  const coveredIds = new Set(names.map(title => findLibraryIcon({ title })?.id || manualIds.get(title)));
  assert.deepEqual([...coveredIds].sort(), catalog.filter(icon => icon.kind === 'website').map(icon => icon.id).sort(), 'all formal website identities are covered');
  coverage = { bookmarks: names.length, automatic: names.length - manual.length, manual: manual.length };
}
const result = { identities: catalog.length, styles: 2, pngSize: 256, coverage, checks };
await fs.writeFile(path.join(root, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ identities: catalog.length, assets: catalog.length * 2, coverage, pngBytes: checks.reduce((sum, row) => sum + row.bytes, 0) }));
