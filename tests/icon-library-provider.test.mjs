import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CURATED_ICONS,
  findLibraryIcon,
  findMatchingIcon,
  getLibraryIconCandidates,
  iconLibraryStats,
  searchLibraryIcons
} from '../core/icons/IconLibraryProvider.js';

test('built-in icon library starts empty', () => {
  assert.deepEqual(CURATED_ICONS, []);
  assert.equal(iconLibraryStats.count, 0);
  assert.deepEqual(searchLibraryIcons('github'), []);
});

test('automatic built-in matching does not inspect a bookmark URL', () => {
  const icon = findLibraryIcon({ title: 'Repository', url: 'https://github.com/openai/openai' });

  assert.equal(icon, null);
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
