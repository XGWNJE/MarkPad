import assert from 'node:assert/strict';
import test from 'node:test';
import { containsRoundedPoint } from '../core/DropTargetGeometry.js';

const rect = { left: 16, top: 88, right: 276, bottom: 784 };

test('rounded target accepts its interior and straight borders, not surrounding margins', () => {
  for (const [x, y] of [[146, 436], [16, 436], [276, 436], [146, 88], [146, 784]]) {
    assert.equal(containsRoundedPoint(rect, x, y, 18), true, `${x}, ${y}`);
  }
  for (const [x, y] of [[15.9, 436], [276.1, 436], [146, 87.9], [146, 784.1]]) {
    assert.equal(containsRoundedPoint(rect, x, y, 18), false, `${x}, ${y}`);
  }
});

test('all four clipped corners reject points inside the box but outside the painted arc', () => {
  for (const [x, y] of [[17, 89], [275, 89], [17, 783], [275, 783]]) {
    assert.equal(containsRoundedPoint(rect, x, y, 18), false, `${x}, ${y}`);
  }
  for (const [x, y] of [[22, 94], [270, 94], [22, 778], [270, 778]]) {
    assert.equal(containsRoundedPoint(rect, x, y, 18), true, `${x}, ${y}`);
  }
});

test('geometry rejects collapsed or invalid rectangles and clamps oversized radii', () => {
  assert.equal(containsRoundedPoint({ left: 0, right: 0, top: 0, bottom: 20 }, 0, 10, 18), false);
  assert.equal(containsRoundedPoint(rect, NaN, 100, 18), false);
  const small = { left: 0, right: 20, top: 0, bottom: 20 };
  assert.equal(containsRoundedPoint(small, 10, 0, 200), true);
  assert.equal(containsRoundedPoint(small, 1, 1, 200), false);
  assert.equal(containsRoundedPoint(rect, 16, 88, 0), true);
});
