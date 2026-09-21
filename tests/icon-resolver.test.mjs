import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveBookmarkIcon } from '../core/icons/IconResolver.js';

function storage(custom = null) {
  return { getCustomIcon: () => custom };
}

test('custom SVG has highest priority and keeps a selected solid background', () => {
  const model = resolveBookmarkIcon({ id: '1', title: 'GitHub' }, {
    storage: storage({
      version: 2,
      kind: 'svg',
      data: '<svg viewBox="0 0 1 1"></svg>',
      background: { mode: 'solid', color: '#123456' }
    }),
    findLibraryIcon: () => {
      throw new Error('library must not run for a custom icon');
    }
  });

  assert.equal(model.source, 'custom');
  assert.equal(model.type, 'svg');
  assert.deepEqual(model.background, { mode: 'solid', color: '#123456' });
});

test('legacy custom image records migrate to the raw display mode without changing stored data', () => {
  const model = resolveBookmarkIcon({ id: '1', title: 'Image' }, {
    storage: storage('data:image/gif;base64,animated'),
    findLibraryIcon: () => null
  });

  assert.equal(model.type, 'image');
  assert.equal(model.value, 'data:image/gif;base64,animated');
  assert.deepEqual(model.background, { mode: 'raw' });
});

test('a name-library match is used when no custom icon exists', () => {
  const model = resolveBookmarkIcon({ id: '1', title: 'Example' }, {
    storage: storage(),
    findLibraryIcon: () => ({
      type: 'svg', svg: '<svg viewBox="0 0 1 1"></svg>', source: 'curated-library', sourceLabel: '内置图标库', matchReason: 'title:Example'
    })
  });

  assert.equal(model.source, 'curated-library');
  assert.equal(model.matchReason, 'title:Example');
});

test('no local match returns the documented empty state instead of an initial', () => {
  const model = resolveBookmarkIcon({ id: '1', title: 'Unknown', url: 'https://example.com' }, {
    storage: storage(),
    findLibraryIcon: () => null
  });

  assert.equal(model, null);
});
