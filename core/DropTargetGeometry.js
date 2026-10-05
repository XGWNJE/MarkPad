/** Test the painted area of a rectangle with equal circular corner radii. */
export function containsRoundedPoint(rect, x, y, radius = 0) {
  const { left, right, top, bottom } = rect;
  if (![left, right, top, bottom, x, y].every(Number.isFinite)
      || right <= left || bottom <= top
      || x < left || x > right || y < top || y > bottom) return false;

  const roundedRadius = Math.min(
    Number.isFinite(radius) ? Math.max(0, radius) : 0,
    (right - left) / 2,
    (bottom - top) / 2
  );
  const centerX = Math.max(left + roundedRadius, Math.min(x, right - roundedRadius));
  const centerY = Math.max(top + roundedRadius, Math.min(y, bottom - roundedRadius));
  return (x - centerX) ** 2 + (y - centerY) ** 2 <= roundedRadius ** 2;
}
