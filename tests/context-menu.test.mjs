import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function readBookmarkCard() {
  return await readFile(new URL('../components/BookmarkCard.js', import.meta.url), 'utf8');
}

function getShowContextMenuSource(source) {
  return source.match(/showContextMenu\(x, y\) \{[\s\S]*?\n  \}/)?.[0] || '';
}

test('context menu groups edit, icon, and destructive actions with clearer labels', async () => {
  const source = await readBookmarkCard();
  const menuSource = getShowContextMenuSource(source);

  assert.match(menuSource, /label: '编辑名称'/);
  assert.match(menuSource, /label: '移动到文件夹...'/);
  assert.match(menuSource, /图标：编辑自定义图标/);
  assert.match(menuSource, /图标：选择或上传/);
  assert.match(menuSource, /label: '图标：设置网站图标背景'/);
  assert.match(menuSource, /label: '图标：重新获取网站图标'/);
  assert.match(menuSource, /label: '删除'/);
  assert.match(menuSource, /className: 'danger'/);
  assert.match(menuSource, /type: 'separator'/);

  assert.doesNotMatch(menuSource, /label: '自定义图标\.\.\.'/);
  assert.doesNotMatch(menuSource, /label: '更换图标\.\.\.'/);
  assert.doesNotMatch(menuSource, /label: '选择 SVG 图标'/);
  assert.doesNotMatch(menuSource, /label: '图标：搜索 SVG'/);
  assert.doesNotMatch(menuSource, /label: '图标：匹配本地图标'/);
});

test('context menu no longer opens a secondary custom icon picker menu', async () => {
  const source = await readBookmarkCard();

  assert.doesNotMatch(source, /pickCustomIcon\(x = 0, y = 0\)/);
  assert.doesNotMatch(source, /data-action="file">从文件选择/);
  assert.doesNotMatch(source, /data-action="svg">粘贴 SVG 代码/);
  assert.doesNotMatch(source, /showSvgPasteDialog\(\)/);
});
