import assert from 'node:assert/strict';
import test from 'node:test';

import { setupGrid } from './helpers/grid-harness.mjs';

for (const [draggedId, targetId, action, expected, index] of [
  ['A', 'C', 'before', ['B', 'F', 'A', 'C', 'G'], 3],
  ['A', 'C', 'after', ['B', 'F', 'C', 'A', 'G'], 4],
  ['C', 'B', 'before', ['A', 'C', 'B', 'F', 'G'], 1],
  ['C', 'B', 'after', ['A', 'B', 'C', 'F', 'G'], 2],
  ['A', 'B', 'after', ['B', 'A', 'F', 'C', 'G'], 2],
  ['B', 'A', 'before', ['B', 'A', 'F', 'C', 'G'], 0]
]) {
  test(`grid persists ${draggedId} ${action} ${targetId} at the same position as its preview`, async () => {
    const harness = await setupGrid();
    const cards = new Map(harness.instance.cards);
    assert.equal(await harness.instance.moveCard({ draggedId, targetId, action }), true);
    await harness.settle();
    assert.deepEqual(harness.model.order('root'), expected);
    assert.deepEqual(harness.order(), expected);
    assert.deepEqual(harness.model.moveCalls, [{ id: draggedId, parentId: 'root', index }]);
    assert.deepEqual(harness.model.getCalls, [[draggedId, targetId]], 'source and target must be fetched in a single API snapshot');
    for (const [id, card] of cards) assert.equal(harness.instance.cards.get(id), card, 'sorting should reuse existing cards');
    assert.equal(harness.lifecycle.rendered.length, 5);
    assert.equal(harness.lifecycle.destroyed.length, 0);
    assert.deepEqual(harness.fullOrder().slice(-2), ['bookmark', 'folder']);
    assert.deepEqual(harness.errors, []);
  });
}

test('adjacent and self no-ops do not write or swallow a following folder move', async () => {
  const harness = await setupGrid();
  for (const command of [
    { draggedId: 'A', targetId: 'B', action: 'before' },
    { draggedId: 'B', targetId: 'A', action: 'after' },
    { draggedId: 'A', targetId: 'A', action: 'after' },
    { draggedId: 'F', targetId: 'F', action: 'into' }
  ]) assert.equal(await harness.instance.moveCard(command), false);
  assert.equal(harness.model.moveCalls.length, 0);
  assert.deepEqual(harness.order(), ['A', 'B', 'F', 'C', 'G']);
  const removedCard = harness.instance.cards.get('A');
  const folderCard = harness.instance.cards.get('F');
  assert.equal(await harness.instance.moveCard({ draggedId: 'A', targetId: 'F', action: 'into' }), true);
  await harness.settle();
  assert.deepEqual(harness.model.order('root'), ['B', 'F', 'C', 'G']);
  assert.deepEqual(harness.order(), ['B', 'F', 'C', 'G']);
  assert.deepEqual(harness.model.order('F'), ['F1', 'A']);
  assert.equal(harness.instance.cards.get('F'), folderCard);
  assert.equal(folderCard.options.childCount, 2);
  assert.deepEqual(harness.lifecycle.destroyed, [removedCard]);
});

test('moving an existing child into its own folder is a no-op without a write', async () => {
  const harness = await setupGrid();
  assert.equal(await harness.instance.moveCard({ draggedId: 'F1', targetId: 'F', action: 'into' }), false);
  assert.equal(harness.model.moveCalls.length, 0);
  assert.deepEqual(harness.model.order('F'), ['F1']);
});

test('moving into an empty folder updates the existing folder card count', async () => {
  const harness = await setupGrid();
  const folderCard = harness.instance.cards.get('G');
  assert.equal(folderCard.options.childCount, 0);
  assert.equal(await harness.instance.moveCard({ draggedId: 'C', targetId: 'G', action: 'into' }), true);
  await harness.settle();
  assert.deepEqual(harness.order(), ['A', 'B', 'F', 'G']);
  assert.deepEqual(harness.model.order('G'), ['C']);
  assert.equal(harness.instance.cards.get('G'), folderCard);
  assert.equal(folderCard.options.childCount, 1);
});

test('cross-folder insertion refreshes an incoming card absent from the optimistic grid', async () => {
  const harness = await setupGrid();
  assert.equal(await harness.instance.moveCard({ draggedId: 'X', targetId: 'B', action: 'before' }), true);
  await harness.settle();
  assert.deepEqual(harness.model.order('other'), []);
  assert.deepEqual(harness.order(), ['A', 'X', 'B', 'F', 'C', 'G']);
  assert.deepEqual(harness.order(), harness.model.order('root'));
  assert.equal(harness.instance.cards.has('X'), true);
});

test('a failed move restores the authoritative order and a later drag still succeeds', async () => {
  const harness = await setupGrid();
  const cards = new Map(harness.instance.cards);
  harness.model.rejectNextMove();
  assert.equal(await harness.instance.moveCard({ draggedId: 'A', targetId: 'C', action: 'after' }), false);
  await harness.settle();
  assert.deepEqual(harness.model.order('root'), ['A', 'B', 'F', 'C', 'G']);
  assert.deepEqual(harness.order(), harness.model.order('root'));
  for (const [id, card] of cards) assert.equal(harness.instance.cards.get(id), card);
  assert.equal(await harness.instance.moveCard({ draggedId: 'C', targetId: 'A', action: 'before' }), true);
  await harness.settle();
  assert.deepEqual(harness.order(), ['C', 'A', 'B', 'F', 'G']);
  assert.deepEqual(harness.order(), harness.model.order('root'));
});

test('move rejection followed by read rejection still rolls back the optimistic order', async () => {
  const harness = await setupGrid();
  const cards = new Map(harness.instance.cards);
  harness.model.rejectNextMove();
  harness.model.rejectNextChildren();
  assert.equal(await harness.instance.moveCard({ draggedId: 'A', targetId: 'C', action: 'after' }), false);
  await harness.settle();
  assert.deepEqual(harness.model.order('root'), ['A', 'B', 'F', 'C', 'G']);
  assert.deepEqual(harness.order(), harness.model.order('root'), 'rollback must not depend on a successful refetch');
  for (const [id, card] of cards) assert.equal(harness.instance.cards.get(id), card);
  assert.equal(harness.lifecycle.destroyed.length, 0);
  assert.match(harness.status.textContent, /失败.*重试/);
  assert.equal(await harness.instance.moveCard({ draggedId: 'A', targetId: 'B', action: 'after' }), true);
  await harness.settle();
  assert.deepEqual(harness.order(), ['B', 'A', 'F', 'C', 'G']);
});

test('failed source/target lookup does not write or leave the grid busy', async () => {
  const harness = await setupGrid();
  harness.model.rejectNextGet();
  assert.equal(await harness.instance.moveCard({ draggedId: 'A', targetId: 'C', action: 'after' }), false);
  assert.equal(harness.model.moveCalls.length, 0);
  assert.deepEqual(harness.order(), harness.model.order('root'));
  assert.equal(await harness.instance.moveCard({ draggedId: 'A', targetId: 'B', action: 'after' }), true);
  await harness.settle();
  assert.deepEqual(harness.order(), ['B', 'A', 'F', 'C', 'G']);
});

for (const eventTiming of ['early', 'late']) {
  test(`a moved event arriving ${eventTiming} does not hide later external changes`, async () => {
    const harness = await setupGrid({ eventTiming });
    assert.equal(await harness.instance.moveCard({ draggedId: 'A', targetId: 'C', action: 'after' }), true);
    assert.deepEqual(harness.order(), harness.model.order('root'), 'the operation must settle without depending on onMoved delivery');
    await harness.model.flushMovedEvents();
    await harness.model.externalMove('X', 'root', 0);
    assert.deepEqual(harness.order(), ['X', 'B', 'F', 'C', 'A', 'G']);
    assert.deepEqual(harness.order(), harness.model.order('root'));
    assert.equal(harness.lifecycle.rendered.length, 6, 'moved events must not rebuild unchanged cards');
  });
}

test('an unrelated external move while a drag write is pending survives reconciliation', async () => {
  const harness = await setupGrid();
  const gate = harness.model.gateNextMove();
  const operation = harness.instance.moveCard({ draggedId: 'A', targetId: 'C', action: 'after' });
  await gate.started;
  await harness.model.externalMove('X', 'root', 0);
  gate.release();
  assert.equal(await operation, true);
  await harness.settle();
  assert.equal(harness.model.order('root').includes('X'), true);
  assert.equal(harness.order().includes('X'), true);
  assert.deepEqual(harness.order(), harness.model.order('root'));
});

test('rapid consecutive drag commands settle consistently and release their busy state', async () => {
  const harness = await setupGrid({ eventTiming: 'late' });
  const gate = harness.model.gateNextMove();
  const first = harness.instance.moveCard({ draggedId: 'A', targetId: 'C', action: 'after' });
  await gate.started;
  const second = harness.instance.moveCard({ draggedId: 'B', targetId: 'G', action: 'before' });
  gate.release();
  const results = await Promise.all([first, second]);
  assert.deepEqual(results, [true, true], 'consecutive commands must be serialized');
  await harness.model.flushMovedEvents();
  assert.deepEqual(harness.model.order('root'), ['F', 'C', 'A', 'B', 'G']);
  assert.deepEqual(harness.order(), harness.model.order('root'));
  assert.equal(await harness.instance.moveCard({ draggedId: 'C', targetId: 'A', action: 'after' }), true);
  await harness.model.flushMovedEvents();
  assert.deepEqual(harness.order(), harness.model.order('root'));
});

test('refresh reuses cards and updates a folder count after an external child move', async () => {
  const harness = await setupGrid();
  const cards = new Map(harness.instance.cards);
  await harness.instance.refresh();
  await harness.model.externalMove('X', 'F');
  for (const [id, card] of cards) assert.equal(harness.instance.cards.get(id), card);
  assert.equal(harness.lifecycle.created.length, 5);
  assert.equal(harness.lifecycle.rendered.length, 5);
  assert.equal(harness.lifecycle.destroyed.length, 0);
  assert.equal(harness.instance.cards.get('F').options.childCount, 2);
});

test('a failed folder refresh preserves the existing cards and permits retry', async () => {
  const harness = await setupGrid();
  const cards = new Map(harness.instance.cards);
  harness.model.rejectNextChildren();
  await harness.instance.refresh();
  assert.deepEqual(harness.order(), ['A', 'B', 'F', 'C', 'G']);
  for (const [id, card] of cards) assert.equal(harness.instance.cards.get(id), card);
  assert.equal(harness.lifecycle.destroyed.length, 0);
  assert.match(harness.status.textContent, /读取书签失败/);
  await harness.instance.refresh();
  assert.deepEqual(harness.order(), harness.model.order('root'));
});

test('navigation disposes cards from the old folder and keeps both creation actions', async () => {
  const harness = await setupGrid();
  const oldCards = [...harness.instance.cards.values()];
  await harness.navigate('F');
  assert.deepEqual(harness.order(), ['F1']);
  for (const card of oldCards) assert.equal(harness.lifecycle.destroyed.filter(item => item === card).length, 1);
  const childCard = harness.instance.cards.get('F1');
  await harness.navigate('G');
  assert.deepEqual(harness.fullOrder(), ['bookmark', 'folder']);
  assert.equal(harness.instance.cards.size, 0);
  assert.equal(harness.lifecycle.destroyed.filter(item => item === childCard).length, 1);
});

test('the latest folder request wins when an earlier data read finishes last', async () => {
  const harness = await setupGrid();
  const gate = harness.model.gateChildren('F');
  const older = harness.startNavigate('F');
  await gate.started;
  await harness.navigate('G');
  gate.release();
  await older;
  await harness.settle();
  assert.deepEqual(harness.fullOrder(), ['bookmark', 'folder']);
  assert.equal(harness.instance.cards.has('F1'), false);
  assert.equal(harness.lifecycle.created.some(card => card.data.id === 'F1'), false, 'stale data must not create a card');
});

test('a stale asynchronous card render is disposed after navigating elsewhere', async () => {
  const harness = await setupGrid();
  const gate = harness.model.gateRender('F1');
  const older = harness.startNavigate('F');
  await gate.started;
  await harness.navigate('G');
  gate.release();
  await older;
  await harness.settle();
  assert.deepEqual(harness.fullOrder(), ['bookmark', 'folder']);
  assert.equal(harness.instance.cards.has('F1'), false);
  const staleCard = harness.lifecycle.created.find(card => card.data.id === 'F1');
  assert.equal(harness.lifecycle.destroyed.filter(card => card === staleCard).length, 1);
  assert.equal(staleCard.element.isConnected, false);
});
