/**
 * main.js - 入口：初始化、事件总线、全局快捷键
 */
import EventBus from './core/EventBus.js';
import Router from './core/Router.js';
import { iconSvg, renderIcons } from './core/IconLibrary.js';
import { containsRoundedPoint } from './core/DropTargetGeometry.js';
import BookmarkGrid from './components/BookmarkGrid.js';
import Breadcrumb from './components/Breadcrumb.js';
import EditDialog from './components/EditDialog.js';
import MoveDialog from './components/MoveDialog.js';
import IconStudio from './components/IconStudio.js';
import BookmarkStore from './core/BookmarkStore.js';
import SettingsPanel from './components/SettingsPanel.js';
import Toolbar from './components/Toolbar.js';
import DeleteDialog from './components/DeleteDialog.js';
import { closeMenus } from './core/MenuInteraction.js';

class App {
  constructor() {
    this.grid = null;
    this.init().finally(() => {
      // 首屏就绪后统一入场；初始化失败也释放隐藏状态，保留错误日志。
      document.getElementById('app').classList.replace('page-enter-pending', 'page-entering');
    });
  }

  async init() {
    await BookmarkStore.initStorage();

    // Chrome 账号书签模式下根文件夹 ID 动态分配，先解析再初始化导航
    const { bookmarkBar } = await BookmarkStore.getRootFolderIds();
    const rootNode = await BookmarkStore.getNode(bookmarkBar);
    Router.setRoot(bookmarkBar, rootNode?.title);

    // 在弹窗订阅前登记，打开模态界面时先释放非模态菜单。
    this.bindMenuLifecycle();

    // 初始化组件
    this.grid = new BookmarkGrid();
    new Breadcrumb();
    this.editDialog = new EditDialog();
    this.moveDialog = new MoveDialog();
    this.iconStudio = new IconStudio();
    // 外观偏好直接映射到主题与卡片令牌。
    new SettingsPanel();
    new Toolbar(this.grid);
    this.deleteDialog = new DeleteDialog(this.grid);
    this.hideDeleteConfirmation = () => this.deleteDialog.hide();
    renderIcons(document);

    // 全局快捷键
    this.bindKeyboardShortcuts();

    // 菜单面板
    this.bindMenuPanel();

    // 拖拽侧边区域
    this.bindDragZones();

    await this.grid.ready;
  }

  bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      const openDialog = document.querySelector('.dialog:not(.hidden)');

      // 关闭必须走组件清理入口，输入框里的 Escape 也要撤销预览。
      if (openDialog) {
        if (key === 'escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          closeMenus();
          if (openDialog.id === 'edit-dialog') this.editDialog.hide();
          else if (openDialog.id === 'move-dialog') this.moveDialog.hide();
          else if (openDialog.id === 'icon-studio') this.iconStudio.hide();
          else if (openDialog.id === 'delete-confirm-dialog') this.hideDeleteConfirmation?.();
          else if (openDialog.id === 'menu-panel') this.setMenuVisible(false);
          return;
        }
        const controls = Array.from(openDialog.querySelectorAll(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )).filter(control => control.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        const isInside = openDialog.contains(e.target);
        if (!isInside || (key === 'tab' && ((!e.shiftKey && document.activeElement === last) || (e.shiftKey && document.activeElement === first)))) {
          e.preventDefault();
          e.stopImmediatePropagation();
          (key === 'tab' && e.shiftKey ? last : first)?.focus();
        }
        return;
      }

      if (e.target.closest?.('.context-menu')) return;
      if (key === 'escape') {
        closeMenus({ returnFocus: true });
        EventBus.emit('grid:organize', false);
        return;
      }

      // 表单控件保留自身的编辑与方向键行为。
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable) {
        return;
      }
      if (e.target.closest?.('#menu-panel')) return;

      if (key === '?') { e.preventDefault(); location.href = 'help.html'; return; }
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && key === 'a' && this.grid.organizing) { e.preventDefault(); this.grid.selectAll(); return; }
      if (key === 'delete' && this.grid.organizing && this.grid.selectedCards.size) {
        e.preventDefault(); e.stopImmediatePropagation(); EventBus.emit('selection:delete'); return;
      }
      const shift = e.shiftKey;

      // N - 新建书签
      if (key === 'n' && !ctrl && !shift) {
        e.preventDefault();
        EventBus.emit('toolbar:newBookmark');
      }

      // Shift+N - 新建文件夹
      if (key === 'n' && !ctrl && shift) {
        e.preventDefault();
        EventBus.emit('toolbar:newFolder');
      }

      // Backspace 或 Alt+← - 返回
      if (key === 'backspace' || (key === 'arrowleft' && e.altKey)) {
        if (Router.canBack()) {
          e.preventDefault();
          Router.back();
        }
      }

      // = / + 放大卡片，- 缩小卡片（不与 Ctrl+滚轮冲突）
      if ((key === '=' || key === '+') && !ctrl) {
        e.preventDefault();
        this.resizeCards(1);
      }
      if (key === '-' && !ctrl) {
        e.preventDefault();
        this.resizeCards(-1);
      }

      // 方向键导航仅作用于卡片区域，不接管设置面板。
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        if (e.target.closest('.bookmark-card, .grid-create-card') && !e.altKey) {
          e.preventDefault();
          this.navigateCards(key);
        }
      }
    }, true);
  }

  resizeCards(direction) {
    EventBus.emit('settings:adjustCardSize', direction);
  }

  navigateCards(direction) {
    const cards = Array.from(document.querySelectorAll('#bookmark-grid > .bookmark-card, #bookmark-grid > .grid-create-card'));
    if (cards.length === 0) return;

    let index = Math.max(0, cards.indexOf(document.activeElement));

    // 动态计算每行列数
    let cols = 1;
    if (cards.length >= 2) {
      const firstTop = cards[0].getBoundingClientRect().top;
      for (let i = 1; i < cards.length; i++) {
        if (cards[i].getBoundingClientRect().top !== firstTop) {
          cols = i;
          break;
        }
      }
      if (cols === 1 && cards[cards.length - 1].getBoundingClientRect().top === firstTop) {
        cols = cards.length; // 所有卡片在同一行
      }
    }

    switch (direction) {
      case 'arrowup':
        index = Math.max(0, index - cols);
        break;
      case 'arrowdown':
        index = Math.min(cards.length - 1, index + cols);
        break;
      case 'arrowleft':
        index = Math.max(0, index - 1);
        break;
      case 'arrowright':
        index = Math.min(cards.length - 1, index + 1);
        break;
    }

    cards[index]?.focus();
  }

  bindMenuLifecycle() {
    for (const name of [
      'toolbar:newBookmark', 'toolbar:newFolder', 'card:editTitle', 'card:move',
      'iconStudio:open', 'iconStudio:openSiteBackground', 'card:requestDelete',
      'card:dragstart', 'navigate', 'settings:open'
    ]) EventBus.on(name, () => closeMenus());
  }

  bindMenuPanel() {
    const panel = document.getElementById('menu-panel');
    this.setMenuVisible = (visible) => {
      const wasOpen = !panel.classList.contains('hidden');
      if (visible) this.settingsReturnFocus = document.activeElement;
      panel.classList.toggle('hidden', !visible);
      panel.inert = !visible;
      panel.setAttribute('aria-hidden', String(!visible));
      if (visible) (panel.querySelector('[role="tab"][aria-selected="true"]') || panel.querySelector('button'))?.focus();
      else if (wasOpen) (this.settingsReturnFocus?.isConnected ? this.settingsReturnFocus : document.getElementById('more-trigger'))?.focus();
    };
    this.setMenuVisible(false);
    EventBus.on('settings:open', () => this.setMenuVisible(true));
    EventBus.on('settings:close', () => this.setMenuVisible(false));
    panel.querySelector('.dialog-overlay').addEventListener('click', () => this.setMenuVisible(false));
  }

  // ── 拖拽侧边区域 ──────────────────────────────────────────────────────────

  bindDragZones() {
    const movePanel    = document.getElementById('drag-move-panel');
    const folderTree   = document.getElementById('drag-folder-tree');
    const deleteZone   = document.getElementById('drag-delete-zone');

    // 当前拖拽的节点 id（dragstart 时由 EventBus 通知）
    let activeDragId   = null;
    let activeDragIsFolder = false;

    // 触发区宽度阈值（占视口百分比）
    const EDGE_RATIO = 0.12;
    const EDGE_DELAY = 180;
    const EXIT_MARGIN = 24;
    let edgeTimer = null;
    let pendingEdge = null;
    // 本次拖拽是否被主动取消（Escape、失焦、切换页面）：取消后松手不再补投放。
    let dragCancelled = false;
    const cancelEdgeActivation = () => {
      if (edgeTimer !== null) clearTimeout(edgeTimer);
      edgeTimer = null;
      pendingEdge = null;
    };
    this._cancelDragZoneActivation = cancelEdgeActivation;

    const endSession = () => {
      activeDragId = null;
      activeDragIsFolder = false;
      this._hideDragZones(movePanel, deleteZone);
    };

    // ── 监听 dragstart/dragend 获取被拖拽项信息 ──
    EventBus.on('card:dragstart', ({ id, isFolder }) => {
      dragCancelled = false;
      this._hideDragZones(movePanel, deleteZone);
      activeDragId = id;
      activeDragIsFolder = isFolder;
    });
    EventBus.on('card:dragend', endSession);
    EventBus.on('drag:sessionEnd', endSession);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && activeDragId) dragCancelled = true;
    }, true);
    window.addEventListener('blur', () => { if (activeDragId) dragCancelled = true; });
    document.addEventListener('visibilitychange', () => { if (document.hidden && activeDragId) dragCancelled = true; });

    const keepsPanelOpen = (panel, event) => {
      if (!panel.classList.contains('visible')) return false;
      if (panel.contains(event.target)) return true;
      const rect = panel.getBoundingClientRect();
      return event.clientX >= rect.left - EXIT_MARGIN && event.clientX <= rect.right + EXIT_MARGIN
        && event.clientY >= rect.top - EXIT_MARGIN && event.clientY <= rect.bottom + EXIT_MARGIN;
    };

    // 退出余量只保留面板；投放必须位于当前可见表面，含圆角裁切。
    const acceptsDrop = (panel, event) => {
      if (!activeDragId || !panel.classList.contains('visible')) return false;
      const style = getComputedStyle(panel);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      return containsRoundedPoint(panel.getBoundingClientRect(), event.clientX, event.clientY,
        parseFloat(style.borderTopLeftRadius) || 0);
    };

    // 浏览器只在当前 dragover 目标上派发 drop，而目标由命中测试决定；这里再按光标的实际
    // 坐标复核一次，只要松手位置落在删除区域内（含小幅容差），这次投放就照常算数。
    const insideDeleteZone = (x, y, margin = 0) => containsRoundedPoint(
      deleteZone.getBoundingClientRect(), x, y,
      (parseFloat(getComputedStyle(deleteZone).borderTopLeftRadius) || 0) + margin);
    const acceptsDeleteDrop = (event, margin = 0) => Boolean(
      activeDragId && deleteZone.classList.contains('visible')
        && Number(getComputedStyle(deleteZone).opacity) !== 0
        && insideDeleteZone(event.clientX, event.clientY, margin));

    // ── 全局 dragover：检测是否进入边缘区域 ──
    document.addEventListener('dragover', (e) => {
      if (!activeDragId) return;
      const x = e.clientX;
      const w = window.innerWidth;

      // 展开后的真实面板边界优先，防止进入面板后被 12% 触发区挤回去。
      if (keepsPanelOpen(movePanel, e) || keepsPanelOpen(deleteZone, e)) {
        cancelEdgeActivation();
        return;
      }

      const side = x <= w * EDGE_RATIO ? 'move' : x >= w * (1 - EDGE_RATIO) ? 'delete' : null;
      movePanel.classList.remove('visible');
      deleteZone.classList.remove('visible', 'over');
      folderTree._stopAutoScroll?.();
      if (!side) {
        cancelEdgeActivation();
        return;
      }
      // 删除区域只是投放面，第一次进入右侧触发区就点亮，快速拖到边缘松手也不会落空。
      if (side === 'delete') {
        cancelEdgeActivation();
        deleteZone.classList.add('visible');
        return;
      }
      if (pendingEdge === side) return;
      cancelEdgeActivation();
      pendingEdge = side;
      const requestedId = activeDragId;
      // 左侧面板要读文件夹树，保留停留延迟，避免只是路过也触发读取。
      edgeTimer = setTimeout(() => {
        edgeTimer = null;
        pendingEdge = null;
        if (activeDragId !== requestedId) return;
        this._showMovePanel(movePanel, folderTree, requestedId);
      }, EDGE_DELAY);
    });

    // ── 右侧删除区域 dragover/dragleave/drop ──
    let lastDeletePointer = null;
    const requestDragDelete = (id) => {
      lastDeletePointer = null;
      deleteZone.classList.remove('over');
      this._hideDragZones(movePanel, deleteZone);
      EventBus.emit('card:requestDelete', { id, isFolder: activeDragIsFolder });
    };

    deleteZone.addEventListener('dragover', (e) => {
      if (!acceptsDrop(deleteZone, e)) {
        deleteZone.classList.remove('over');
        lastDeletePointer = null;
        e.dataTransfer.dropEffect = 'none';
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      deleteZone.classList.add('over');
      // dragend 不保证带上松手坐标，这里记住最近一次位于删除区域内的光标位置。
      lastDeletePointer = { x: e.clientX, y: e.clientY };
    });
    deleteZone.addEventListener('dragleave', (e) => {
      if (!deleteZone.contains(e.relatedTarget)) {
        deleteZone.classList.remove('over');
        lastDeletePointer = null;
      }
    });
    deleteZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = e.dataTransfer.getData('text/plain') || activeDragId || '';
      // 命中测试可能把落点判给下层元素：只要坐标仍在区域内，就按这一次投放处理。
      if (id && id === activeDragId && acceptsDeleteDrop(e, 8)) requestDragDelete(id);
      else {
        deleteZone.classList.remove('over');
        this._hideDragZones(movePanel, deleteZone);
      }
    });
    // 兜底：浏览器没有派发 drop（目标被判定为下层元素）时，用最后一次区域内的位置补一次确认。
    document.addEventListener('dragend', () => {
      const pointer = lastDeletePointer;
      const id = activeDragId;
      const cancelled = dragCancelled;
      lastDeletePointer = null;
      dragCancelled = false;
      if (!pointer || !id || cancelled || !deleteZone.classList.contains('visible')) return;
      if (Number(getComputedStyle(deleteZone).opacity) === 0) return;
      if (!insideDeleteZone(pointer.x, pointer.y, 8)) return;
      requestDragDelete(id);
    }, true);

    // ── 左侧面板内的 dragover/drop ──
    let _scrollRaf = null;
    let _scrollSpeed = 0;

    const _stopAutoScroll = () => {
      if (_scrollRaf) { cancelAnimationFrame(_scrollRaf); _scrollRaf = null; }
      _scrollSpeed = 0;
    };

    // 挂到元素上，供 _hideDragZones 统一调用
    folderTree._stopAutoScroll = _stopAutoScroll;

    const _startAutoScroll = (speed) => {
      if (!speed) return _stopAutoScroll();
      _scrollSpeed = speed;
      if (_scrollRaf) return;
      const step = () => {
        folderTree.scrollTop += _scrollSpeed;
        _scrollRaf = requestAnimationFrame(step);
      };
      _scrollRaf = requestAnimationFrame(step);
    };

    folderTree.addEventListener('dragover', (e) => {
      if (!acceptsDrop(movePanel, e)) {
        folderTree.querySelectorAll('.drag-folder-item').forEach(el => el.classList.remove('drag-target'));
        _stopAutoScroll();
        e.dataTransfer.dropEffect = 'none';
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      // 文件夹高亮
      const item = e.target.closest('.drag-folder-item');
      folderTree.querySelectorAll('.drag-folder-item').forEach(el => el.classList.remove('drag-target'));
      if (item) item.classList.add('drag-target');

      // 自动滚动：检测鼠标距面板顶/底的距离
      const rect = folderTree.getBoundingClientRect();
      const ZONE = 60;   // 触发区高度 px
      const MAX  = 12;   // 最大滚动速度 px/帧
      const distTop    = e.clientY - rect.top;
      const distBottom = rect.bottom - e.clientY;

      if (distTop < ZONE && distTop > 0) {
        _startAutoScroll(-Math.round(MAX * (1 - distTop / ZONE)));
      } else if (distBottom < ZONE && distBottom > 0) {
        _startAutoScroll(Math.round(MAX * (1 - distBottom / ZONE)));
      } else {
        _stopAutoScroll();
      }
    });

    folderTree.addEventListener('dragleave', (e) => {
      if (!folderTree.contains(e.relatedTarget)) {
        folderTree.querySelectorAll('.drag-folder-item').forEach(el => el.classList.remove('drag-target'));
        _stopAutoScroll();
      }
    });

    folderTree.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      _stopAutoScroll();
      const id = e.dataTransfer.getData('text/plain');
      const targetEl = e.target.closest('.drag-folder-item');
      if (id && id === activeDragId && targetEl && acceptsDrop(movePanel, e)) {
        const targetFolderId = targetEl.dataset.id;
        if (targetFolderId && targetFolderId !== id) {
          EventBus.emit('card:drop', { draggedId: id, targetId: targetFolderId, action: 'into' });
        }
      }
      this._hideDragZones(movePanel, deleteZone);
    });
  }

  /** 加载并渲染文件夹树到移动面板 */
  async _showMovePanel(movePanel, folderTree, excludeId) {
    movePanel.classList.add('visible');
    if (folderTree.dataset.loadedFor === excludeId) return; // 已加载，无需重复
    const request = (folderTree._loadVersion || 0) + 1;
    folderTree._loadVersion = request;
    folderTree.dataset.loadedFor = excludeId;
    folderTree.innerHTML = '<div class="drag-panel-status" role="status">加载中…</div>';

    try {
      const tree = await BookmarkStore.getTree();
      const { other: otherBookmarksId } = await BookmarkStore.getRootFolderIds();
      if (folderTree._loadVersion !== request || folderTree.dataset.loadedFor !== excludeId) return;
      folderTree.innerHTML = '';
      // 从书签栏根节点开始递归渲染，排除被拖拽节点及其子孙
      this._renderDragFolderTree(tree[0]?.children || [], folderTree, 0, excludeId, otherBookmarksId);
    } catch {
      if (folderTree._loadVersion === request && folderTree.dataset.loadedFor === excludeId) {
        folderTree.innerHTML = '<div class="drag-panel-status drag-panel-status-error" role="status">加载失败</div>';
      }
    }
  }

  /** 递归渲染文件夹树节点（跳过书签，只渲染文件夹） */
  _renderDragFolderTree(nodes, container, depth, excludeId, otherBookmarksId = null) {
    for (const node of nodes) {
      if (node.url) continue;           // 跳过书签
      if (node.id === excludeId) continue; // 跳过被拖拽节点
      if (otherBookmarksId && node.id === otherBookmarksId) continue; // 跳过"其他书签"

      const item = document.createElement('div');
      item.className = 'drag-folder-item';
      item.classList.toggle('drag-folder-root', depth === 0);
      item.dataset.id = node.id;
      item.title = node.title;
      item.style.setProperty('--drag-folder-depth', depth);
      const icon = document.createElement('span');
      icon.className = 'folder-icon';
      icon.innerHTML = iconSvg('folder');

      const name = document.createElement('span');
      name.className = 'folder-name';
      name.textContent = node.title;

      item.appendChild(icon);
      item.appendChild(name);
      container.appendChild(item);

      if (node.children?.length) {
        this._renderDragFolderTree(node.children, container, depth + 1, excludeId, otherBookmarksId);
      }
    }
  }

  _hideDragZones(movePanel, deleteZone) {
    this._cancelDragZoneActivation?.();
    movePanel.classList.remove('visible');
    deleteZone.classList.remove('visible', 'over');
    const folderTree = document.getElementById('drag-folder-tree');
    if (folderTree) {
      folderTree.dataset.loadedFor = '';
      folderTree._loadVersion = (folderTree._loadVersion || 0) + 1;
      folderTree._stopAutoScroll?.();
      folderTree.querySelectorAll('.drag-folder-item').forEach(el => el.classList.remove('drag-target'));
    }
  }

  _escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

}

// 启动
new App();
