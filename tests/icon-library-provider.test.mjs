import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CURATED_ICONS,
  findLibraryIcon,
  findMatchingIcon,
  getLibraryIconById,
  getLibraryIconCandidates,
  iconLibraryStats,
  searchLibraryIcons
} from '../core/icons/IconLibraryProvider.js';

test('both icon styles cover the reviewed website and folder catalog', () => {
  assert.equal(CURATED_ICONS.length, 91);
  assert.equal(iconLibraryStats.count, 91);
  assert.equal(new Set(CURATED_ICONS.map(icon => icon.id)).size, 91);
  assert.equal(CURATED_ICONS.filter(icon => icon.kind === 'website').length, 88);
  for (const item of CURATED_ICONS) {
    const clay = getLibraryIconById(item.id, { style: 'clay' });
    const flat = getLibraryIconById(item.id, { style: 'flat' });
    assert.equal(clay.type, 'image');
    assert.ok(clay.value.endsWith(`/clay/${item.id}.png`));
    assert.ok(flat.value.endsWith(`/flat/${item.id}.svg`));
    assert.equal(clay.fallbackValue, flat.value);
  }
  assert.equal(searchLibraryIcons('github')[0].id, 'github');
});

test('brand aliases share one identity while generic console names require manual selection', () => {
  const website = title => ({ title, url: 'https://example.test' });
  assert.equal(findLibraryIcon(website('DeepSeek 开放平台')).id, 'deepseek');
  assert.equal(findLibraryIcon(website('Recientes – Figma')).id, 'figma');
  assert.equal(findLibraryIcon(website('VisionGuard · 统一入口')).id, 'visionguard');
  assert.equal(findLibraryIcon(website('RunningHub云端ComfyUI')).id, 'runninghub');
  assert.deepEqual(getLibraryIconCandidates(website('RunningHub云端ComfyUI')).candidates.map(icon => icon.id), ['runninghub', 'comfyui']);
  assert.equal(findLibraryIcon(website('控制台')), null);
  assert.equal(findLibraryIcon(website('服务器 - 轻量云 - 控制台')), null);
  assert.equal(findLibraryIcon(website('AI 3D模型生成器')), null);
  assert.equal(searchLibraryIcons('腾讯云')[0].id, 'tencentcloud');
});

test('folder names match exactly and never match website titles', () => {
  assert.equal(findLibraryIcon({ title: '长期留存' }, { kind: 'folder' }).id, 'archive');
  assert.equal(findLibraryIcon({ title: '分享' }, { kind: 'folder' }).id, 'share');
  assert.equal(findLibraryIcon({ title: '分享资源' }, { kind: 'folder' }), null);
  assert.equal(findLibraryIcon({ title: '分享', url: 'https://example.test' }), null);
  assert.equal(searchLibraryIcons('', { kind: 'folder' }).length, 3);
});

test('automatic built-in matching does not inspect a bookmark URL', () => {
  const icon = findLibraryIcon({ title: 'Repository', url: 'https://github.com/openai/openai' });

  assert.equal(icon, null);
  const nameOnly = { title: 'GitHub' };
  Object.defineProperty(nameOnly, 'url', { get() { throw new Error('matcher must not read addresses'); } });
  assert.equal(findLibraryIcon(nameOnly).id, 'github');
  assert.equal(getLibraryIconCandidates(nameOnly).candidates[0].id, 'github');
});

test('future curated icons match only terms present in the bookmark name', () => {
  const icons = [{
    id: 'curated:example',
    title: 'Example',
    terms: ['示例站'],
    svg: '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>'
  }];

  const titleMatch = findMatchingIcon(icons, '我的示例站');
  const urlOnlyMatch = findMatchingIcon(icons, '工作入口');

  assert.equal(titleMatch.id, 'curated:example');
  assert.equal(titleMatch.matchReason, 'title:示例站');
  assert.equal(urlOnlyMatch, null);
});

test('candidate context exposes the name alone', () => {
  const result = getLibraryIconCandidates({
    title: 'Internal Tool',
    url: 'https://private.example/path?secret=value'
  });

  assert.deepEqual(result.signals, { title: 'Internal Tool' });
  assert.deepEqual(result.queries, [{ source: 'title', sourceLabel: '书签名称', value: 'Internal Tool' }]);
  assert.deepEqual(result.candidates, []);
});
