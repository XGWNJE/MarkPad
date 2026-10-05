let activeMenu = null;

/** Release a menu's document/window listeners without invoking its close action. */
export function releaseMenu(menu) {
  if (!activeMenu || activeMenu.menu !== menu) return;
  const record = activeMenu;
  activeMenu = null;
  record.cleanup.forEach(cleanup => cleanup());
}

/** Close the current non-modal menu, optionally restoring its source focus. */
export function closeMenus({ returnFocus = false } = {}) {
  const record = activeMenu;
  if (!record) return;
  releaseMenu(record.menu);
  record.onClose(returnFocus);
}

/** Only one non-modal menu owns input dismissal listeners at a time. */
export function activateMenu(menu, onClose, { trigger = null } = {}) {
  if (activeMenu?.menu === menu) return;
  closeMenus();
  const record = { menu, onClose, cleanup: [] };
  activeMenu = record;
  const document = menu.ownerDocument;
  const window = document?.defaultView;
  const inside = target => menu.contains(target) || Boolean(trigger?.contains(target));
  const listen = (target, name, callback, capture = false) => {
    if (!target?.addEventListener) return;
    target.addEventListener(name, callback, capture);
    record.cleanup.push(() => target.removeEventListener(name, callback, capture));
  };
  const close = () => {
    if (activeMenu === record) closeMenus();
  };
  const closeOutside = event => { if (!inside(event.target)) close(); };
  listen(document, 'pointerdown', closeOutside, true);
  listen(document, 'focusin', closeOutside, true);
  // A menu's own scrolling must keep its items and form controls usable.
  listen(document, 'scroll', event => { if (!menu.contains(event.target)) close(); }, true);
  listen(document, 'dragstart', close, true);
  listen(document, 'visibilitychange', () => { if (document.hidden) close(); });
  listen(window, 'blur', close);
  listen(window, 'resize', () => {
    if (activeMenu === record) closeMenus({ returnFocus: true });
  });
}

/** Keep a hidden settings panel outside the keyboard and accessibility tree. */
export function setPanelVisible(panel, trigger, visible, { returnFocus = false } = {}) {
  const wasVisible = panel.classList.contains('visible');
  if (!visible && wasVisible && returnFocus) trigger.focus({ preventScroll: true });
  panel.inert = !visible;
  panel.setAttribute('aria-hidden', String(!visible));
  panel.classList.toggle('visible', visible);
  trigger.classList.toggle('active', visible);
  trigger.setAttribute('aria-expanded', String(visible));
}

/** Menu items use a roving focus; Tab exits normally and Escape returns focus. */
export function bindMenuKeyboard(menu, onClose) {
  const items = [...menu.querySelectorAll('[role="menuitem"]')]
    .filter(item => !item.disabled && item.getAttribute('aria-disabled') !== 'true');
  const focusItem = index => {
    items.forEach((item, itemIndex) => { item.tabIndex = itemIndex === index ? 0 : -1; });
    items[index]?.focus({ preventScroll: true });
    items[index]?.scrollIntoView({ block: 'nearest' });
  };
  const onKey = event => {
    const key = event.key;
    if (key === 'Escape' || key === 'Tab') {
      if (key === 'Escape') event.preventDefault();
      event.stopPropagation();
      onClose(true);
      return;
    }
    if (!event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      const shortcut = items.find(item => item.getAttribute('aria-keyshortcuts')?.split(/\s+/)
        .some(value => value.toLowerCase() === key.toLowerCase()));
      if (shortcut) {
        event.preventDefault();
        event.stopPropagation();
        shortcut.click();
        return;
      }
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) return;
    event.preventDefault();
    event.stopPropagation();
    const index = items.indexOf(menu.ownerDocument.activeElement);
    if (key === 'Home') focusItem(0);
    else if (key === 'End') focusItem(items.length - 1);
    else focusItem((index + (key === 'ArrowDown' ? 1 : -1) + items.length) % items.length);
  };
  menu.addEventListener('keydown', onKey);
  focusItem(0);
  return () => menu.removeEventListener('keydown', onKey);
}
