import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const read = (f) => readFile(new URL('../' + f, import.meta.url), 'utf8');
test('new tab explicitly declares packaged MarkPad tab assets', async () => {
  const html = await read('index.html'),
    manifest = JSON.parse(await read('manifest.json'));
  assert.match(html, /href="icons\/tab-icon\.svg"/);
  assert.match(html, /href="icons\/icon48\.png"/);
  assert.equal(manifest.icons['48'], 'icons/icon48.png');
});
test('three fixed controls expose create, organize and more without duplicate grid actions', async () => {
  const html = await read('index.html'),
    toolbar = await read('components/Toolbar.js'),
    css = await read('css/modules/toolbar.css');
  for (const id of ['new-trigger', 'organize-trigger', 'more-trigger'])
    assert.match(html, new RegExp('id="' + id + '"'));
  assert.match(toolbar, /toolbar:newBookmark/);
  assert.match(toolbar, /toolbar:newFolder/);
  assert.match(toolbar, /settings:open/);
  assert.match(toolbar, /help.html/);
  assert.doesNotMatch(html, /grid-create-card|menu-trigger/);
  assert.doesNotMatch(css, /@media[^{}]*max-width/);
});
