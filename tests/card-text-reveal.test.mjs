import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const read = (f) => readFile(new URL('../' + f, import.meta.url), 'utf8');
test('card captions remain below the clipped icon in normal flow', async () => {
  const css = await read('css/modules/card.css'),
    source = await read('components/BookmarkCard.js');
  const info = css.match(/\.card-info \{[^}]*\}/)[0];
  assert.doesNotMatch(info, /absolute|opacity|visibility/);
  assert.doesNotMatch(css, /filter: blur/);
  assert.match(
    source,
    /this\.element\.appendChild\(surface\);\s*this\.element\.appendChild\(info\);/
  );
  assert.match(css, /overflow: hidden/);
});
test('card text has no separate visibility preference', async () => {
  for (const file of ['index.html', 'components/SettingsPanel.js', 'components/BookmarkCard.js'])
    assert.doesNotMatch(await read(file), /showCardText|data-show-card-text/);
});
test('mouse and touch share one click path with native links and folder buttons', async () => {
  const card = await read('components/BookmarkCard.js');
  assert.doesNotMatch(card, /revealTextOnTap|text-revealed/);
  assert.match(card, /createElement\(this\.isFolder \? 'button' : 'a'\)/);
  assert.match(card, /this\.organizing \|\| e\.ctrlKey \|\| e\.metaKey/);
  assert.match(card, /aria-label/);
});
