import { iconSvg } from './IconLibrary.js';
import { activateMenu, bindMenuKeyboard, releaseMenu, closeMenus } from './MenuInteraction.js';

/** Click/tap menus shared by the fixed toolbar and collapsed folder path. */
export function showActionMenu(trigger, rows, heading = '') {
  if (trigger.getAttribute('aria-expanded') === 'true') return closeMenus({ returnFocus: true });
  const menu = document.createElement('div');
  menu.className = 'context-menu action-menu';
  menu.setAttribute('role', 'menu');
  let unbind;
  const close = (returnFocus = false) => {
    releaseMenu(menu);
    unbind?.();
    menu.remove();
    trigger.setAttribute('aria-expanded', 'false');
    if (returnFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
  };
  if (heading) {
    const title = document.createElement('div');
    title.className = 'context-menu-title';
    title.textContent = heading;
    menu.appendChild(title);
  }
  for (const row of rows) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `context-menu-item ${row.className || ''}`;
    item.setAttribute('role', 'menuitem');
    item.innerHTML = iconSvg(row.icon);
    const label = document.createElement('span');
    label.textContent = row.label;
    item.appendChild(label);
    item.addEventListener('click', () => {
      close(true);
      row.action();
    });
    menu.appendChild(item);
  }
  activateMenu(menu, close, { trigger });
  document.body.appendChild(menu);
  trigger.setAttribute('aria-expanded', 'true');
  const source = trigger.getBoundingClientRect(),
    rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(source.right - rect.width, innerWidth - rect.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(source.bottom + 8, innerHeight - rect.height - 8))}px`;
  unbind = bindMenuKeyboard(menu, close);
}
