/**
 * main.js - 入口：初始化、事件总线、全局快捷键
 */
import EventBus from './core/EventBus.js';
import Router from './core/Router.js';
import { iconSvg, renderIcons } from './core/IconLibrary.js';
import BookmarkGrid from './components/BookmarkGrid.js';
import Breadcrumb from './components/Breadcrumb.js';
import Toolbar from './components/Toolbar.js';
import EditDialog from './components/EditDialog.js';
import MoveDialog from './components/MoveDialog.js';
import QuickFind from './components/QuickFind.js';
import IconStudio from './components/IconStudio.js';
import BookmarkStore from './core/BookmarkStore.js';
import SettingsPanel from './components/SettingsPanel.js';

class App {
  constructor() {
    this.grid = null;
    this.init();
  }

  async init() {
    await BookmarkStore.initStorage();

    // Chrome 账号书签模式下根文件夹 ID 动态分配，先解析再初始化导航
    const { bookmarkBar } = await BookmarkStore.getRootFolderIds();
    const rootNode = await BookmarkStore.getNode(bookmarkBar);
    Router.setRoot(bookmarkBar, rootNode?.title);

    // 初始化组件
    this.grid = new BookmarkGrid();
    new Breadcrumb();
    new Toolbar();
    new EditDialog();
    new MoveDialog();
    new QuickFind();
    new IconStudio();
    // SettingsPanel 同时负责 #background-effect-layer 上的背景光效（含浅深配色与开关）
    new SettingsPanel();
    renderIcons(document);

    // 全局快捷键
    this.bindKeyboardShortcuts();

    // 菜单面板
    this.bindMenuPanel();

    // 拖拽侧边区域
    this.bindDragZones();

    // 全局拖拽
    this.bindGlobalDrag();

  }

  bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // 忽略输入框中的按键
      if (e.target.tagName === 'INPUT' || e.target.contentEditable === 'true') {
        return;
      }

      const key = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
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

      // Ctrl+F 或 / - 搜索
      if ((ctrl && key === 'f') || key === '/') {
        e.preventDefault();
        EventBus.emit('toolbar:search');
      }

      // Backspace 或 Alt+← - 返回
      if (key === 'backspace' || (key === 'arrowleft' && e.altKey)) {
        if (Router.canBack()) {
          e.preventDefault();
          Router.back();
        }
      }

      // Escape - 关闭弹窗
      if (key === 'escape') {
        // 关闭所有弹窗
        document.querySelectorAll('.dialog, .settings-panel, .quick-find').forEach(el => {
          el.classList.add('hidden');
        });
        const menuPanel = document.getElementById('menu-panel');
        const menuTrigger = document.getElementById('menu-trigger');
        const searchTrigger = document.getElementById('btn-search');
        menuPanel?.classList.remove('visible');
        menuTrigger?.classList.remove('active');
        menuTrigger?.setAttribute('aria-expanded', 'false');
        searchTrigger?.classList.remove('active');
        searchTrigger?.setAttribute('aria-expanded', 'false');
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

      // 方向键导航（弹窗打开时不响应）
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        const hasOpenDialog = document.querySelector('.dialog:not(.hidden), .quick-find:not(.hidden)');
        if (!hasOpenDialog && !e.altKey) {
          e.preventDefault();
          this.navigateCards(key);
        }
      }
    });
  }

  resizeCards(direction) {
    EventBus.emit('settings:adjustCardSize', direction);
  }

  navigateCards(direction) {
    const cards = Array.from(document.querySelectorAll('.bookmark-card'));
    if (cards.length === 0) return;

    const focused = document.querySelector('.bookmark-card:focus');
    let index = focused ? cards.indexOf(focused) : 0;

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

  bindMenuPanel() {
    const trigger = document.getElementById('menu-trigger');
    const panel   = document.getElementById('menu-panel');
    const newBtn  = document.getElementById('open-mode-new');
    const curBtn  = document.getElementById('open-mode-current');
    const setMenuVisible = (visible) => {
      panel.classList.toggle('visible', visible);
      trigger.classList.toggle('active', visible);
      trigger.setAttribute('aria-expanded', String(visible));
    };

    // 读取并应用已保存的跳转方式（默认：新标签页）
    const saved = localStorage.getItem('openMode') || 'new';
    this.applyOpenMode(saved, newBtn, curBtn);

    // 切换按钮
    document.getElementById('open-mode-group').addEventListener('click', (e) => {
      const btn = e.target.closest('.menu-toggle-btn');
      if (!btn) return;
      const mode = btn.dataset.value;
      localStorage.setItem('openMode', mode);
      this.applyOpenMode(mode, newBtn, curBtn);
    });

    // 点击触发按钮切换面板
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      setMenuVisible(!panel.classList.contains('visible'));
    });

    // 面板内点击不冒泡（防止被外部关闭）
    panel.addEventListener('click', (e) => e.stopPropagation());

    // 点击外部关闭
    document.addEventListener('click', () => {
      setMenuVisible(false);
    });
  }

  applyOpenMode(mode, newBtn, curBtn) {
    if (mode === 'current') {
      curBtn.classList.add('active');
      newBtn.classList.remove('active');
    } else {
      newBtn.classList.add('active');
      curBtn.classList.remove('active');
    }
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

    // ── 监听 dragstart/dragend 获取被拖拽项信息 ──
    EventBus.on('card:dragstart', ({ id, isFolder }) => {
      activeDragId = id;
      activeDragIsFolder = isFolder;
    });
    EventBus.on('card:dragend', () => {
      activeDragId = null;
      activeDragIsFolder = false;
      this._hideDragZones(movePanel, deleteZone);
    });

    // ── 全局 dragover：检测是否进入边缘区域 ──
    document.addEventListener('dragover', (e) => {
      if (!activeDragId) return;
      const x = e.clientX;
      const w = window.innerWidth;

      if (x <= w * EDGE_RATIO) {
        // 进入左侧区域
        if (!movePanel.classList.contains('visible')) {
          this._showMovePanel(movePanel, folderTree, activeDragId);
        }
        deleteZone.classList.remove('visible');
      } else if (x >= w * (1 - EDGE_RATIO)) {
        // 进入右侧区域
        if (!deleteZone.classList.contains('visible')) {
          deleteZone.classList.add('visible');
        }
        movePanel.classList.remove('visible');
      } else {
        // 中间区域：收回两侧面板
        movePanel.classList.remove('visible');
        deleteZone.classList.remove('visible');
      }
    });

    // ── 右侧删除区域 dragover/dragleave/drop ──
    let pendingDeleteId = null;
    let pendingDeleteIsFolder = false;

    deleteZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      deleteZone.classList.add('over');
    });
    deleteZone.addEventListener('dragleave', (e) => {
      if (!deleteZone.contains(e.relatedTarget)) {
        deleteZone.classList.remove('over');
      }
    });
    deleteZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = e.dataTransfer.getData('text/plain');
      if (id) {
        EventBus.emit('card:requestDelete', { id, isFolder: activeDragIsFolder });
      }
      deleteZone.classList.remove('over');
      this._hideDragZones(movePanel, deleteZone);
    });

    // 删除确认弹窗确认按钮
    document.getElementById('delete-confirm-btn').addEventListener('click', () => {
      if (pendingDeleteId) {
        EventBus.emit('card:delete', { id: pendingDeleteId, isFolder: pendingDeleteIsFolder });
        pendingDeleteId = null;
        pendingDeleteIsFolder = false;
      }
      document.getElementById('delete-confirm-dialog').classList.add('hidden');
    });

    // 删除确认弹窗取消/关闭
    const deleteConfirmDialog = document.getElementById('delete-confirm-dialog');
    deleteConfirmDialog.querySelectorAll('[data-action="cancel"], [data-action="close"]').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingDeleteId = null;
        pendingDeleteIsFolder = false;
        deleteConfirmDialog.classList.add('hidden');
      });
    });

    EventBus.on('card:requestDelete', async ({ id, isFolder, title }) => {
      pendingDeleteId = id;
      pendingDeleteIsFolder = isFolder;
      document.getElementById('delete-confirm-message').textContent =
        await this._getDeleteConfirmMessage(id, isFolder, title);
      deleteConfirmDialog.classList.remove('hidden');
    });

    // ── 左侧面板内的 dragover/drop ──
    let _scrollRaf = null;

    const _stopAutoScroll = () => {
      if (_scrollRaf) { cancelAnimationFrame(_scrollRaf); _scrollRaf = null; }
    };

    // 挂到元素上，供 _hideDragZones 统一调用
    folderTree._stopAutoScroll = _stopAutoScroll;

    const _startAutoScroll = (speed) => {
      _stopAutoScroll();
      const step = () => {
        folderTree.scrollTop += speed;
        _scrollRaf = requestAnimationFrame(step);
      };
      _scrollRaf = requestAnimationFrame(step);
    };

    folderTree.addEventListener('dragover', (e) => {
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
      if (id && targetEl) {
        const targetFolderId = targetEl.dataset.id;
        if (targetFolderId && targetFolderId !== id) {
          BookmarkStore.move(id, targetFolderId);
        }
      }
      this._hideDragZones(movePanel, deleteZone);
    });
  }

  /** 加载并渲染文件夹树到移动面板 */
  async _showMovePanel(movePanel, folderTree, excludeId) {
    movePanel.classList.add('visible');
    if (folderTree.dataset.loadedFor === excludeId) return; // 已加载，无需重复
    folderTree.dataset.loadedFor = excludeId;
    folderTree.innerHTML = '<div style="padding:12px 20px;font-size:12px;color:var(--text-tertiary)">加载中…</div>';

    try {
      const tree = await BookmarkStore.getTree();
      const { other: otherBookmarksId } = await BookmarkStore.getRootFolderIds();
      folderTree.innerHTML = '';
      // 从书签栏根节点开始递归渲染，排除被拖拽节点及其子孙
      this._renderDragFolderTree(tree[0]?.children || [], folderTree, 0, excludeId, otherBookmarksId);
    } catch {
      folderTree.innerHTML = '<div style="padding:12px 20px;font-size:12px;color:var(--danger)">加载失败</div>';
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
      item.dataset.id = node.id;
      item.style.paddingLeft = `${depth * 16 + 16}px`;
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
    movePanel.classList.remove('visible');
    deleteZone.classList.remove('visible', 'over');
    const folderTree = document.getElementById('drag-folder-tree');
    if (folderTree) {
      folderTree.dataset.loadedFor = '';
      folderTree._stopAutoScroll?.();
    }
  }

  async _getDeleteConfirmMessage(id, isFolder, title = '') {
    if (!isFolder) {
      return `确定要删除书签“${title || '此书签'}”吗？`;
    }

    try {
      const node = await BookmarkStore.getNode(id);
      const count = BookmarkStore.countDescendants(node);
      const name = title || node?.title || '此文件夹';
      return `确定要删除文件夹“${name}”吗？其中包含 ${count} 个子项，会一并删除。`;
    } catch {
      return `确定要删除文件夹“${title || '此文件夹'}”吗？其中的子项会一并删除。`;
    }
  }

  _escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ──────────────────────────────────────────────────────────────────────────

  bindGlobalDrag() {
    let dragCounter = 0;

    document.addEventListener('dragenter', () => {
      dragCounter++;
      document.querySelector('.bookmark-grid')?.classList.add('drag-active');
    });

    document.addEventListener('dragleave', () => {
      dragCounter--;
      if (dragCounter === 0) {
        document.querySelector('.bookmark-grid')?.classList.remove('drag-active');
      }
    });

    document.addEventListener('drop', () => {
      dragCounter = 0;
      document.querySelector('.bookmark-grid')?.classList.remove('drag-active');
    });
  }

}

// 启动
new App();
