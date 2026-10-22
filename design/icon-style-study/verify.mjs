import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { sanitizeSvg } from '../../core/icons/IconSanitizer.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
let sharp;
try { sharp = require(process.env.MARKPAD_SHARP_PATH || 'sharp'); }
catch { sharp = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')); }
const study = JSON.parse(await fs.readFile(path.join(root, 'study.json'), 'utf8'));
assert.equal(study.samples.length, 15);
assert.equal(study.styles.length, 6);
assert.equal(new Set(study.samples.map(s => s.id)).size, 15);
let svgCount = 0, pngCount = 0;
const pngSizes = new Set();
for (const style of study.styles) {
  const ext = style.format.toLowerCase();
  const dir = path.join(root, 'icons', style.folder);
  const files = (await fs.readdir(dir)).filter(f => f.endsWith('.' + ext));
  assert.equal(files.length, 15, `${style.id}: expected exactly 15 icons`);
  for (const sample of study.samples) {
    const file = path.join(dir, `${sample.id}.${ext}`);
    const bytes = await fs.readFile(file);
    assert.ok(bytes.length > 100, `Empty asset: ${file}`);
    if (ext === 'svg') {
      const svg = bytes.toString('utf8').trim();
      assert.equal(sanitizeSvg(svg), svg, `SVG is not sanitized: ${file}`);
      assert.match(svg, /viewBox="0 0 256 256"/);
      assert.doesNotMatch(svg, /<(?:script|image|use|foreignObject)\b|\bon[a-z]+\s*=/i);
      await sharp(bytes).png().toBuffer();
      svgCount++;
    } else {
      const meta = await sharp(bytes).metadata();
      assert.equal(meta.format, 'png');
      assert.ok(meta.width >= 512 && meta.height >= 512, `PNG too small: ${file}`);
      assert.equal(meta.width, meta.height, `PNG not square: ${file}`);
      assert.equal(meta.hasAlpha, true, `Missing alpha channel: ${file}`);
      const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const a = (x, y) => data[(y * info.width + x) * info.channels + 3];
      for (const [x, y] of [[0, 0], [info.width - 1, 0], [0, info.height - 1], [info.width - 1, info.height - 1]]) assert.equal(a(x, y), 0, `Opaque PNG corner: ${file}`);
      let transparent = 0, solid = 0, edgeSolid = 0;
      const margin = Math.floor(info.width * .035);
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        const alpha = a(x, y);
        if (alpha === 0) transparent++;
        if (alpha > 64) {
          solid++;
          if (x < margin || y < margin || x >= info.width - margin || y >= info.height - margin) edgeSolid++;
        }
      }
      assert.ok(transparent > info.width * info.height * .2, `PNG does not have enough transparent backdrop: ${file}`);
      assert.ok(solid > info.width * info.height * .03, `PNG is nearly empty: ${file}`);
      assert.equal(edgeSolid, 0, `PNG content reaches crop edge: ${file}`);
      pngSizes.add(`${meta.width}x${meta.height}`);
      pngCount++;
    }
  }
}
const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
const js = await fs.readFile(path.join(root, 'study.js'), 'utf8');
for (const source of ['study-data.js', 'study.js', 'study.css', 'README.md']) await fs.access(path.join(root, source));
assert.doesNotMatch(html + js, /chrome\.bookmarks|chrome\.storage|bookmarks_2026|192\.168|[?&](token|secret|key)=/i);
assert.doesNotMatch(html, /(?:src|href)="https?:\/\//i);
console.log(JSON.stringify({ passed: true, svg: svgCount, png: pngCount, total: svgCount + pngCount, pngSizes: [...pngSizes], checks: ['SVG safety and renderability', 'PNG dimensions and real alpha', 'No content near crop edges', 'Local-only preview resources'] }, null, 2));
