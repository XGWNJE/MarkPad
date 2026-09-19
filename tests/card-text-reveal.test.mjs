import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function read(path) {
  return await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('card text is an overlay that only appears on hover or focus', async () => {
  const cardCss = await read('css/modules/card.css');
  const infoBlock = cardCss.match(/\.card-info \{[\s\S]*?\n\}/)?.[0] || '';

  assert.match(infoBlock, /position: absolute;/);
  assert.match(infoBlock, /opacity: 0;/);
  assert.doesNotMatch(infoBlock, /display: none/);

  const revealBlock = cardCss.match(/\.bookmark-card:hover \.card-info[\s\S]*?\n\}/)?.[0] || '';
  assert.match(revealBlock, /opacity: 1;/);
  assert.match(revealBlock, /\.bookmark-card:focus-visible \.card-info/);
  assert.match(revealBlock, /\.bookmark-card:focus-within \.card-info/);
  assert.match(revealBlock, /\.bookmark-card\.text-revealed \.card-info/);

  // 文字展开不能改变卡片尺寸，否则网格会重排
  const cardBlock = cardCss.match(/\.bookmark-card \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(cardBlock, /aspect-ratio: 1;/);
});

test('the card text on/off setting is gone from every layer', async () => {
  const html = await read('index.html');
  const settings = await read('components/SettingsPanel.js');
  const cardCss = await read('css/modules/card.css');
  const card = await read('components/BookmarkCard.js');

  for (const source of [html, settings, cardCss, card]) {
    assert.doesNotMatch(source, /showCardText/);
    assert.doesNotMatch(source, /data-show-card-text/);
  }
  assert.doesNotMatch(html, /id="card-text-group"/);
  assert.doesNotMatch(settings, /cardTextKey/);
});

test('touch taps reveal the card text before opening', async () => {
  const card = await read('components/BookmarkCard.js');
  const clickHandler = card.match(/this\.element\.addEventListener\('click',[\s\S]*?\n    \}\);/)?.[0] || '';

  assert.match(clickHandler, /if \(this\.revealTextOnTap\(\)\) return;/);
  // 触屏/手写笔才拦截，鼠标仍然一次点击打开
  assert.match(card, /this\.lastPointerType = e\.pointerType/);
  assert.match(card, /lastPointerType !== 'touch' && this\.lastPointerType !== 'pen'/);
  assert.match(card, /classList\.add\('text-revealed'\)/);
  assert.match(card, /revealedCard\.hideText\(\)/);
});
