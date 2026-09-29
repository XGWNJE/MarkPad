import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function read(path) {
  return await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('card text overlays icons and stays visible when no icon is available', async () => {
  const cardCss = await read('css/modules/card.css');
  const infoBlock = cardCss.match(/\.card-info \{[\s\S]*?\n\}/)?.[0] || '';

  assert.match(infoBlock, /position: absolute;/);
  assert.match(infoBlock, /inset: 0;/);
  assert.match(infoBlock, /backdrop-filter: blur\(var\(--card-overlay-blur\)\);/);
  assert.match(infoBlock, /background: var\(--card-overlay-bg\);/);
  assert.doesNotMatch(infoBlock, /clip-path:|border-radius:/);
  const surfaceBlock = cardCss.match(/\.card-surface \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(surfaceBlock, /clip-path: inset\(0 round var\(--card-radius\)\);/);
  assert.match(surfaceBlock, /overflow: hidden;/);
  assert.match(infoBlock, /justify-content: center;/);
  assert.match(infoBlock, /align-items: center;/);
  assert.match(infoBlock, /text-align: center;/);
  assert.match(infoBlock, /opacity: 0;/);
  assert.doesNotMatch(infoBlock, /display: none/);

  const revealBlock = cardCss.match(/\.bookmark-card:hover \.card-info[\s\S]*?\n\}/)?.[0] || '';
  assert.match(revealBlock, /opacity: 1;/);
  assert.match(revealBlock, /\.bookmark-card:focus-visible \.card-info/);
  assert.match(revealBlock, /\.bookmark-card:focus-within \.card-info/);
  assert.match(revealBlock, /\.bookmark-card\.text-revealed \.card-info/);
  assert.match(revealBlock, /\.bookmark-card\.iconless \.card-info/);
  assert.match(cardCss, /\.bookmark-card:hover \.card-icon-wrapper,[\s\S]*?filter: blur\(var\(--card-overlay-blur\)\);/);

  // 文字展开不能改变卡片尺寸，否则网格会重排
  const cardBlock = cardCss.match(/\.bookmark-card \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(cardBlock, /aspect-ratio: 1;/);

  const card = await read('components/BookmarkCard.js');
  assert.match(card, /info\.appendChild\(title\);\s*info\.appendChild\(meta\);/);
  assert.match(card, /surface\.appendChild\(iconWrapper\);[\s\S]*surface\.appendChild\(info\);/);
  assert.match(card, /classList\.toggle\('iconless', !available\)/);
  assert.match(card, /this\.setIconAvailable\(Boolean\(iconModel\)\)/);
  assert.doesNotMatch(card, /iconTextColor|--icon-text-color/);
  const titleBlock = cardCss.match(/\.card-title \{[\s\S]*?\n\}/)?.[0] || '';
  const metaBlock = cardCss.match(/\.card-meta \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(titleBlock, /font-weight: var\(--card-overlay-title-weight\);/);
  for (const block of [titleBlock, metaBlock]) {
    assert.match(block, /color: var\(--card-overlay-text\);/);
  }
  const variables = await read('css/modules/variables.css');
  assert.match(variables, /--card-overlay-title-weight: 900;/);
  assert.match(variables, /--card-overlay-text: #ffffff;/);
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
