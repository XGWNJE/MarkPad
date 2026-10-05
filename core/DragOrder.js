/** Chrome 的 index 指向移除源节点前的插槽；同目录补偿由 Chrome 完成。 */
export function getMoveDestination(source, target, action) {
  if (!source || !target) throw new Error('Bookmark no longer exists');
  if (source.id === target.id) return { parentId: source.parentId, index: source.index, noOp: true };
  if (action === 'into') {
    if (target.url) throw new Error('Move target is not a folder');
    return { parentId: target.id, index: undefined, noOp: source.parentId === target.id };
  }
  if (action !== 'before' && action !== 'after') throw new Error('Invalid drop action');
  const index = target.index + (action === 'after' ? 1 : 0);
  return {
    parentId: target.parentId,
    index,
    noOp: source.parentId === target.parentId && (index === source.index || index === source.index + 1)
  };
}

export function getPreviewOrder(ids, sourceId, targetId, action) {
  if (sourceId === targetId || !ids.includes(sourceId) || !ids.includes(targetId)) return [...ids];
  const result = ids.filter(id => id !== sourceId);
  if (action === 'into') return result;
  if (action !== 'before' && action !== 'after') return [...ids];
  result.splice(result.indexOf(targetId) + (action === 'after' ? 1 : 0), 0, sourceId);
  return result;
}

/** 命中固定插槽，动画后的邻卡坐标不会反过来改变目标。 */
export function hitTestSlots(slots, sourceId, x, y) {
  if (!slots.length) return null;
  const distance = ({ rect }) => {
    const dx = Math.max(rect.left - x, 0, x - rect.right);
    const dy = Math.max(rect.top - y, 0, y - rect.bottom);
    return dx * dx + dy * dy * 4;
  };
  const nearest = slots.reduce((best, slot) => distance(slot) < distance(best) ? slot : best);
  const { rect } = nearest;
  if (nearest.id === sourceId) return null;
  const ratio = (x - rect.left) / rect.width;
  const central = nearest.isFolder && ratio >= 0.28 && ratio <= 0.72 && y >= rect.top && y <= rect.bottom;
  return { targetId: nearest.id, action: ratio < 0.5 ? 'before' : 'after', central };
}
