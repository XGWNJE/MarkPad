import assert from 'node:assert/strict';
import test from 'node:test';

import { getMoveDestination, getPreviewOrder, hitTestSlots } from '../core/DragOrder.js';

const node = (id, index, parentId = 'root') => ({ id, index, parentId });

test('move destinations use Chrome insertion slots before removing the source', () => {
  for (const [source, target, action, index] of [
    [node('A', 0), node('C', 2), 'before', 2],
    [node('A', 0), node('C', 2), 'after', 3],
    [node('D', 3), node('B', 1), 'before', 1],
    [node('D', 3), node('B', 1), 'after', 2],
    [node('A', 0), node('B', 1), 'after', 2],
    [node('B', 1), node('A', 0), 'before', 0]
  ]) {
    assert.deepEqual(getMoveDestination(source, target, action), { parentId: 'root', index, noOp: false });
  }
});

test('adjacent insertion slots and dragging onto the same card are no-ops', () => {
  assert.deepEqual(getMoveDestination(node('A', 0), node('B', 1), 'before'), { parentId: 'root', index: 1, noOp: true });
  assert.deepEqual(getMoveDestination(node('B', 1), node('A', 0), 'after'), { parentId: 'root', index: 1, noOp: true });
  for (const action of ['before', 'after']) {
    assert.equal(getMoveDestination(node('A', 0), node('A', 0), action).noOp, true);
  }
});

test('cross-folder destinations retain target indices and into uses an append destination', () => {
  assert.deepEqual(getMoveDestination(node('A', 0, 'other'), node('C', 2), 'before'), { parentId: 'root', index: 2, noOp: false });
  assert.deepEqual(getMoveDestination(node('A', 0, 'other'), node('C', 2), 'after'), { parentId: 'root', index: 3, noOp: false });
  assert.deepEqual(getMoveDestination(node('A', 0), node('F', 2), 'into'), { parentId: 'F', index: undefined, noOp: false });
  assert.deepEqual(getMoveDestination(node('A', 0, 'F'), node('F', 2), 'into'), { parentId: 'F', index: undefined, noOp: true });
});

test('preview order matches forward, backward, adjacent, and no-op destinations', () => {
  const original = ['A', 'B', 'C', 'D'];
  for (const [source, target, action, expected] of [
    ['A', 'C', 'before', ['B', 'A', 'C', 'D']],
    ['A', 'C', 'after', ['B', 'C', 'A', 'D']],
    ['D', 'B', 'before', ['A', 'D', 'B', 'C']],
    ['D', 'B', 'after', ['A', 'B', 'D', 'C']],
    ['A', 'B', 'after', ['B', 'A', 'C', 'D']],
    ['B', 'A', 'before', ['B', 'A', 'C', 'D']],
    ['A', 'B', 'before', original],
    ['B', 'A', 'after', original],
    ['A', 'A', 'after', original]
  ]) {
    assert.deepEqual(getPreviewOrder(original, source, target, action), expected);
    assert.deepEqual(original, ['A', 'B', 'C', 'D'], 'preview must not mutate its input');
  }
});

test('previews keep all unrelated IDs and ignore missing drag targets', () => {
  const original = ['A', 'B', 'F', 'C'];
  assert.deepEqual(getPreviewOrder(original, 'A', 'F', 'into'), ['B', 'F', 'C']);
  assert.deepEqual(getPreviewOrder(original, 'missing', 'B', 'after'), original);
  assert.deepEqual(getPreviewOrder(original, 'A', 'missing', 'before'), original);
  assert.deepEqual(original, ['A', 'B', 'F', 'C']);
});

test('invalid drag destinations reject missing nodes, non-folders, and unknown actions', () => {
  assert.throws(() => getMoveDestination(null, node('A', 0), 'before'), /no longer exists/);
  assert.throws(() => getMoveDestination(node('A', 0), null, 'after'), /no longer exists/);
  assert.throws(() => getMoveDestination(node('A', 0), { ...node('B', 1), url: 'https://example.com' }, 'into'), /not a folder/);
  assert.throws(() => getMoveDestination(node('A', 0), node('B', 1), 'unknown'), /Invalid drop action/);
});

const slot = (id, left, top, isFolder = false) => ({ id, isFolder, rect: { left, top, width: 120, height: 120, right: left + 120, bottom: top + 120 } });

test('folder hit testing uses horizontal edges and a bounded central entry zone', () => {
  const folder = slot('F', 0, 0, true);
  folder.rect.width = 100;
  folder.rect.right = 100;
  const slots = [slot('A', -140, 0), folder, slot('B', 140, 0)];
  for (const [x, action, central] of [
    [27.9, 'before', false], [28, 'before', true], [50, 'after', true],
    [72, 'after', true], [72.1, 'after', false]
  ]) {
    assert.deepEqual(hitTestSlots(slots, 'A', x, 60), { targetId: 'F', action, central });
  }
  assert.equal(hitTestSlots(slots, 'A', 50, 130).central, false, 'a gap below a folder must not become an entry target');
});

test('fixed slots cover card gaps and wrapped rows without targeting the drag source', () => {
  const slots = [slot('A', 0, 0), slot('F', 140, 0, true), slot('B', 280, 0), slot('C', 0, 160), slot('D', 140, 160)];
  assert.deepEqual(hitTestSlots(slots, 'B', 130, 60), { targetId: 'A', action: 'after', central: false });
  assert.deepEqual(hitTestSlots(slots, 'B', 134, 60), { targetId: 'F', action: 'before', central: false });
  assert.deepEqual(hitTestSlots(slots, 'B', 20, 145), { targetId: 'C', action: 'before', central: false });
  assert.equal(hitTestSlots(slots, 'A', 60, 60), null);
  assert.equal(hitTestSlots([], 'A', 60, 60), null);
});
