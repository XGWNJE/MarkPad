/** Immediate webpage opening and on-demand folder feedback. */
const sessions = new WeakMap();
const entrances = new WeakMap();
const active = new Set();
let leaving = null;
let removeLifecycle = null;

function reducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}

function tokens(element) {
  const style = getComputedStyle(element);
  const read = (key, fallback, min, max) => {
    const value = Number.parseFloat(style.getPropertyValue(key));
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  };
  const duration = (key, fallback, max) => {
    const value = style.getPropertyValue(key).trim();
    const number = Number.parseFloat(value);
    return Number.isFinite(number)
      ? Math.min(max, Math.max(0, number * (value.endsWith('ms') ? 1 : 1000)))
      : fallback;
  };
  return {
    feedback: duration('--card-open-duration', 220, 320),
    entrance: duration('--folder-enter-duration', 180, 260),
    scale: read('--card-open-press-scale', 0.985, 0.97, 1),
    offset: read('--folder-enter-offset', 4, 0, 6),
    ease: style.getPropertyValue('--ease-lumen').trim() || 'cubic-bezier(0.2, 0, 0, 1)'
  };
}

function watchLifecycle() {
  if (removeLifecycle) return;
  const finish = () => [...active].forEach(item => item.finishMotion());
  const cancel = () => [...active].forEach(item => item.cancel());
  const visibility = () => { if (document.hidden) finish(); };
  window.addEventListener('blur', finish);
  window.addEventListener('pagehide', cancel);
  window.addEventListener('pageshow', cancel);
  document.addEventListener('visibilitychange', visibility);
  removeLifecycle = () => {
    window.removeEventListener('blur', finish);
    window.removeEventListener('pagehide', cancel);
    window.removeEventListener('pageshow', cancel);
    document.removeEventListener('visibilitychange', visibility);
    removeLifecycle = null;
  };
}

function release(item) {
  active.delete(item);
  if (!active.size) removeLifecycle?.();
}

function animate(element, frames, duration, ease) {
  if (!duration || !element?.animate) return null;
  try { return element.animate(frames, { duration, easing: ease, fill: 'both' }); }
  catch { return null; }
}

const CardNavigation = {
  open(card, { mode, prepare, navigate }) {
    const existing = sessions.get(card);
    if (existing) return existing.promise;
    if (card.destroyed || card.interactionPaused) return Promise.resolve(false);
    // A second activation supersedes a current-tab lookup that has not committed.
    leaving?.cancel();
    const surface = card.element?.querySelector('.card-surface');
    const values = mode === 'folder' ? tokens(card.element) : null;
    const duration = values && !reducedMotion() && surface?.animate ? values.feedback : 0;
    const animations = [];
    let disposed = false;
    let timer = null;
    let resolveMotion;
    let resolveCanceled;
    const canceled = new Promise(resolve => { resolveCanceled = resolve; });
    const motion = new Promise(resolve => { resolveMotion = resolve; });
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      window.clearTimeout(timer);
      animations.forEach(animation => animation?.cancel());
      resolveMotion();
      resolveCanceled();
      sessions.delete(card);
      if (leaving === session) leaving = null;
      card.setOpening(false);
      release(session);
    };
    const session = {
      promise: null,
      cancel: cleanup,
      finishMotion() {
        window.clearTimeout(timer);
        animations.forEach(animation => animation?.cancel());
        resolveMotion();
      }
    };
    sessions.set(card, session);
    active.add(session);
    if (mode === 'current') leaving = session;
    watchLifecycle();
    card.setOpening(true);
    if (duration) {
      const startTransform = getComputedStyle(surface).transform || 'none';
      animations.push(animate(surface, [
        { transform: startTransform, opacity: 1 },
        { transform: `scale(${values.scale})`, opacity: 0.88, offset: 0.35 },
        { transform: 'none', opacity: 1 }
      ], duration, values.ease));
    }
    if (duration) timer = window.setTimeout(resolveMotion, duration);
    else resolveMotion();

    // Background tabs and folder routing commit inside the original activation.
    // Current-tab preparation captures this document's tab and updates it as soon
    // as the lookup completes, without an animation or a visual delay.
    let operation;
    try { operation = mode === 'current' ? prepare() : navigate(); }
    catch (error) { operation = Promise.reject(error); }
    const ready = Promise.resolve(operation);
    session.promise = (async () => {
      try {
        const prepared = await Promise.race([ready, canceled]);
        if (disposed) return false;
        await motion;
        if (disposed) return false;
        if (mode === 'current') {
          await Promise.race([Promise.resolve(navigate(prepared)), canceled]);
          if (disposed) return false;
        }
        return !disposed;
      } catch (error) {
        if (!disposed) console.error('[MarkPad] Open failed:', error);
        return false;
      } finally { cleanup(); }
    })();
    return session.promise;
  },

  cancel(card) { sessions.get(card)?.cancel(); },

  enterFolder(grid) {
    this.cancelFolderEntrance(grid);
    const target = grid.closest?.('.grid-scroll-inner') || grid;
    if (reducedMotion() || !target.animate) return;
    const values = tokens(target);
    const animation = animate(target, [
      { opacity: 0, transform: `translateY(${values.offset}px)` },
      { opacity: 1, transform: 'translateY(0)' }
    ], values.entrance, values.ease);
    if (!animation) return;
    let timer;
    const entrance = {
      cancel() {
        window.clearTimeout(timer);
        animation.cancel();
        entrances.delete(grid);
        release(entrance);
      },
      finishMotion() { this.cancel(); }
    };
    entrances.set(grid, entrance);
    active.add(entrance);
    watchLifecycle();
    timer = window.setTimeout(() => entrance.cancel(), values.entrance);
  },

  cancelFolderEntrance(grid) { entrances.get(grid)?.cancel(); }
};

export default CardNavigation;
