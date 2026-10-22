import EventBus from '../core/EventBus.js';
import BookmarkStore from '../core/BookmarkStore.js';
import { showActionMenu } from '../core/ActionMenu.js';

export default class Toolbar {
  constructor(grid) {
    this.grid = grid;
    const byId = (id) => document.getElementById(id);
    byId('new-trigger').onclick = (event) =>
      showActionMenu(event.currentTarget, [
        {
          icon: 'bookmark-plus',
          label: '新建书签',
          action: () => EventBus.emit('toolbar:newBookmark')
        },
        {
          icon: 'folder-plus',
          label: '新建文件夹',
          action: () => EventBus.emit('toolbar:newFolder')
        }
      ]);
    byId('organize-trigger').onclick = () => grid.setOrganizing(!grid.organizing);
    byId('organize-done').onclick = () => {
      grid.setOrganizing(false);
      byId('organize-trigger').focus();
    };
    byId('more-trigger').onclick = (event) =>
      showActionMenu(event.currentTarget, [
        { icon: 'settings', label: '设置', action: () => EventBus.emit('settings:open') },
        {
          icon: 'circle-question-mark',
          label: '帮助',
          action: () => {
            location.href = 'help.html';
          }
        }
      ]);
    const selected = () =>
      [...grid.cards.values()].filter((card) => grid.selectedCards.has(card.data.id));
    byId('action-rename').onclick = () => selected()[0]?.startEdit();
    byId('action-icon').onclick = () => {
      const card = selected()[0];
      if (card)
        EventBus.emit('iconStudio:open', { bookmark: card.data, returnFocus: byId('action-icon') });
    };
    byId('action-move').onclick = () =>
      EventBus.emit('card:move', {
        ids: selected().map((card) => card.data.id),
        returnFocus: byId('action-move')
      });
    const requestDelete = () => {
      const cards = selected();
      if (cards.length)
        EventBus.emit('card:requestDelete', {
          ids: cards.map((card) => card.data.id),
          returnFocus: byId('action-delete')
        });
    };
    byId('action-delete').onclick = requestDelete;
    EventBus.on('selection:delete', requestDelete);
    byId('action-more').onclick = (event) => {
      const one = selected().length === 1 ? selected()[0] : null;
      const rows = [];
      const overflow = [
        ['action-rename', 'pencil', '重命名…', Boolean(one)],
        ['action-move', 'folder-input', '移动与排序…', grid.selectedCards.size > 0],
        ['action-icon', 'image', '图标工坊…', Boolean(one)],
        ['action-delete', 'trash', '删除…', grid.selectedCards.size > 0]
      ];
      for (const [id, icon, label, enabled] of overflow)
        if (byId(id).hidden && enabled)
          rows.push({ icon, label, className: id === 'action-delete' ? 'danger' : '', action: () => byId(id).onclick() });
      rows.push({ icon: 'square-check', label: '全选', action: () => grid.selectAll() });
      if (grid.selectedCards.size)
        rows.push({ icon: 'square-check', label: '取消选择', action: () => grid.clearSelection() });
      if (one && BookmarkStore.getCustomIcon(one.data.id))
        rows.push({
          icon: 'rotate-ccw',
          label: '恢复默认图标',
          action: () => one.removeCustomIcon()
        });
      if (one?.siteIconModel && !BookmarkStore.getCustomIcon(one.data.id))
        rows.push({
          icon: 'sliders-horizontal',
          label: '调整网站图标',
          action: () =>
            EventBus.emit('iconStudio:openSiteBackground', {
              bookmark: one.data,
              returnFocus: byId('action-more')
            })
        });
      if (
        one &&
        /^https?:\/\//i.test(one.data.url || '') &&
        !BookmarkStore.getCustomIcon(one.data.id)
      )
        rows.push({
          icon: 'refresh-cw',
          label: '重新获取网站图标',
          action: () => one.refreshWebsiteIcon()
        });
      showActionMenu(event.currentTarget, rows);
    };
    EventBus.on('selection:changed', () => this.update());
    this.update();
    new ResizeObserver(() =>
      document.documentElement.style.setProperty(
        '--toolbar-height',
        `${byId('toolbar').getBoundingClientRect().height}px`
      )
    ).observe(byId('toolbar'));
    new ResizeObserver(() => this.fitActions()).observe(byId('selection-bar'));
    document.fonts?.ready.then(() => this.fitActions());
  }

  update() {
    const count = this.grid.selectedCards.size;
    document.getElementById('selection-bar').hidden = !this.grid.organizing;
    document
      .getElementById('organize-trigger')
      .setAttribute('aria-pressed', String(this.grid.organizing));
    document.getElementById('selection-count').textContent = `已选 ${count} 项`;
    document.body.classList.toggle('is-organizing', this.grid.organizing);
    for (const id of ['action-rename', 'action-icon'])
      document.getElementById(id).disabled = count !== 1;
    for (const id of ['action-move', 'action-delete'])
      document.getElementById(id).disabled = !count;
    this.fitActions();
  }

  fitActions() {
    const bar = document.getElementById('selection-bar');
    if (bar.hidden) return;
    const actions = bar.querySelector('.selection-actions');
    const buttons = [...actions.children];
    buttons.forEach((button) => {
      button.hidden = false;
    });
    const style = getComputedStyle(bar),
      gap = parseFloat(getComputedStyle(actions).gap);
    const available =
      bar.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const used = () =>
      document.getElementById('selection-count').getBoundingClientRect().width +
      document.getElementById('organize-done').getBoundingClientRect().width +
      parseFloat(style.gap) * 2 +
      buttons
        .filter((button) => !button.hidden)
        .reduce((sum, button) => sum + parseFloat(getComputedStyle(button).width) + gap, -gap);
    for (const id of ['action-icon', 'action-rename', 'action-move', 'action-delete']) {
      if (used() <= available) break;
      document.getElementById(id).hidden = true;
    }
  }
}
