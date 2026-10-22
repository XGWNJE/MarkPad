import assert from 'node:assert/strict';
import test from 'node:test';
import { bookmark, setupGrid } from './helpers/grid-harness.mjs';
test('the grid contains bookmarks only; creation has one fixed toolbar entry', async () => {
  const h = await setupGrid({ folders: { root: [bookmark('a'), bookmark('b')] } });
  assert.deepEqual(h.fullOrder(), ['a', 'b']);
  assert.equal(h.grid.querySelectorAll('.grid-create-card').length, 0);
  h.instance.selectAll();
  assert.deepEqual([...h.instance.selectedCards], ['a', 'b']);
});
test('empty folders have one status and repeated refresh does not duplicate it', async () => {
  const h = await setupGrid({ folders: { root: [], empty: [] } });
  await h.navigate('empty');
  await h.instance.refresh();
  assert.equal(h.grid.children.length, 1);
  assert.equal(h.instance.stateElement.children[0].textContent, '这里还没有书签');
  assert.deepEqual(h.fullOrder(), []);
});
test('reordering never creates extra toolbar actions in the grid', async () => {
  const h = await setupGrid({ folders: { root: [bookmark('a'), bookmark('b'), bookmark('c')] } });
  h.instance.applyOptimisticReorder('a', 'c', 'after');
  assert.deepEqual(h.fullOrder(), ['b', 'c', 'a']);
  assert.equal(h.instance.cards.size, 3);
});
test('entering organize ends layout motion and immediately releases selection', async () => {
  const h = await setupGrid();
  let cancelled = 0;
  h.instance.dragController.clearMotion = () => cancelled++;
  for (const card of h.instance.cards.values()) {
    card.paused = true;
    card.setInteractionPaused = (value) => {
      card.paused = value;
    };
  }
  h.instance.setOrganizing(true);
  assert.equal(cancelled, 1);
  assert.ok([...h.instance.cards.values()].every((card) => card.paused === false));
  h.instance.setOrganizing(true);
  assert.equal(cancelled, 1);
});
