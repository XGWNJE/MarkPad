import assert from 'node:assert/strict';
import test from 'node:test';
import { bookmark, setupGrid } from './helpers/grid-harness.mjs';

test('creation cards follow bookmarks and dispatch the existing dialog actions', async () => {
  const { instance, grid, emitted, fullOrder } = await setupGrid({ folders: { root: [bookmark('a'), bookmark('b')] } });
  assert.deepEqual(fullOrder(), ['a', 'b', 'bookmark', 'folder']);
  assert.equal(instance.cards.size, 2);
  const actions = grid.querySelectorAll('.grid-create-card');
  for (const action of actions) {
    assert.equal(action.tagName, 'button');
    assert.equal(action.type, 'button');
    assert.equal(action.draggable, false);
    action.click();
  }
  assert.deepEqual(emitted.map(([name]) => name), ['toolbar:newBookmark', 'toolbar:newFolder']);
  instance.selectAll();
  assert.deepEqual([...instance.selectedCards], ['a', 'b']);
});

test('empty folders retain both creation actions and refresh does not duplicate them', async () => {
  const { instance, fullOrder, navigate } = await setupGrid({ folders: { root: [bookmark('a')], empty: [] } });
  const actions = [...instance.createActions];
  await navigate('empty');
  assert.deepEqual(fullOrder(), ['bookmark', 'folder']);
  assert.equal(instance.cards.size, 0);
  await instance.refresh();
  assert.deepEqual(fullOrder(), ['bookmark', 'folder']);
  assert.deepEqual([...instance.createActions], actions, 'refresh should reuse the action buttons');
  await navigate('root');
  assert.deepEqual(fullOrder(), ['a', 'bookmark', 'folder']);
});

test('moving a bookmark after the last bookmark preserves creation actions at the end', async () => {
  const { instance, fullOrder } = await setupGrid({ folders: { root: [bookmark('a'), bookmark('b'), bookmark('c')] } });
  instance.applyOptimisticReorder('a', 'c', 'after');
  assert.deepEqual(fullOrder(), ['b', 'c', 'a', 'bookmark', 'folder']);
  instance.applyOptimisticReorder('a', 'b', 'before');
  assert.deepEqual(fullOrder(), ['a', 'b', 'c', 'bookmark', 'folder']);
  assert.equal(instance.cards.size, 3);
});
