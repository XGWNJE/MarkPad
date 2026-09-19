/**
 * BookmarkGrid - 书签网格渲染与交互
 */
import EventBus from '../core/EventBus.js';
import BookmarkStore from '../core/BookmarkStore.js';
import Router from '../core/Router.js';
import BookmarkCard from './BookmarkCard.js';
import { iconSvg } from '../core/IconLibrary.js';

class BookmarkGrid {
  constructor() {
    this.grid = document.getElementById('bookmark-grid');
    this.cards = new Map();
    this.selectedCards = new Set();
    this.isLoading = false;
    this.suppressNextMoveRefresh = false;

    this.init();
  }

  init() {
    // 监听导航
    EventBus.on('navigate', async ({ id }) => {
      await this.loadFolder(id);
    });

    // 监听书签变更
    EventBus.on('created', () => this.refresh());
    EventBus.on('removed', () => this.refresh());
    EventBus.on('changed', async ({ id, title, url }) => {
      const card = this.cards.get(id);
      if (card) {
        await card.update({ title, url });
      }
    });
    EventBus.on('moved', () => {
      if (this.suppressNextMoveRefresh) {
        this.suppressNextMoveRefresh = false;
        return;
      }
      this.refresh();
    });
    EventBus.on('childrenReordered', () => this.refresh());

    // 监听卡片事件
    EventBus.on('card:openFolder', ({ id, title }) => {
      Router.push(id, title);
    });

    EventBus.on('card:delete', ({ id, isFolder }) => {
      this.deleteCard(id, isFolder);
    });

    EventBus.on('card:rename', async ({ id, title }) => {
      await BookmarkStore.update(id, title);
    });

    EventBus.on('icon:applied', ({ id, iconData }) => {
      const card = this.cards.get(id);
      if (card) {
        card.updateIcon(iconData);
      }
    });

    EventBus.on('card:select', ({ id, selected }) => {
      if (selected) {
        this.selectedCards.add(id);
      } else {
        this.selectedCards.delete(id);
      }
    });

    EventBus.on('card:drop', async ({ draggedId, targetId, action, position }) => {
      if (action === 'into') {
        // 拖入文件夹
        await BookmarkStore.move(draggedId, targetId);
      } else if (action === 'reorder') {
        // 同级排序：获取目标的实际位置
        try {
          const [targetNodes] = await Promise.all([
            chrome.bookmarks.get(targetId)
          ]);
          const targetNode = targetNodes[0];
          const [draggedNodes] = await Promise.all([
            chrome.bookmarks.get(draggedId)
          ]);
          const draggedNode = draggedNodes[0];

          let newIndex = targetNode.index;
          if (position === 'after') {
            newIndex = targetNode.index + 1;
          }
          // 如果在同一个父文件夹中，且拖拽源在目标之前，需要调整索引
          if (draggedNode.parentId === targetNode.parentId && draggedNode.index < targetNode.index) {
            newIndex = Math.max(0, newIndex - 1);
          }

          this.applyOptimisticReorder(draggedId, targetId, position);
          this.suppressNextMoveRefresh = true;
          await BookmarkStore.move(draggedId, targetNode.parentId, newIndex);
        } catch (err) {
          this.suppressNextMoveRefresh = false;
          console.error('Reorder failed:', err);
          await this.refresh();
        }
      }
    });

    // 新建书签
    EventBus.on('bookmark:create', ({ parentId, title, url }) => {
      this.createBookmark(parentId, title, url);
    });

    // 新建文件夹
    EventBus.on('folder:create', ({ parentId, title }) => {
      this.createFolder(parentId, title);
    });

    // 初始加载（根节点 ID 启动时已由 Router 解析）
    this.loadFolder(Router.getRootId());
  }

  async loadFolder(folderId) {
    if (this.isLoading) return;

    // 文件夹可能已被外部删除（其他设备同步、书签管理器等），
    // 先校验存在性，失效则回退到根目录，避免 getChildren 抛 "Can't find bookmark for id."
    if (folderId && folderId !== Router.getRootId()) {
      const node = await BookmarkStore.getNode(folderId);
      if (!node) {
        Router.goToIndex(0); // 触发 navigate -> 重新加载根目录
        return;
      }
    }

    this.isLoading = true;

    // 清空
    this.grid.innerHTML = '';
    this.cards.clear();
    this.selectedCards.clear();

    try {
      // 获取数据
      const children = await BookmarkStore.getChildren(folderId);
      const hasFolders = children.some(child => !child.url);
      const folderChildCounts = hasFolders
        ? await BookmarkStore.getFolderChildCountMap()
        : new Map();

      // 渲染
      if (children.length === 0) {
        this.renderEmpty();
      } else {
        for (let index = 0; index < children.length; index++) {
          const child = children[index];
          const card = new BookmarkCard(child, this.grid, {
            childCount: folderChildCounts.get(child.id)
          });
          const element = await card.render();
          element.style.animationDelay = `${index * 30}ms`;
          element.classList.add('loaded');
          this.grid.appendChild(element);
          this.cards.set(child.id, card);
        }
      }
    } catch (err) {
      console.error('loadFolder failed:', err);
    } finally {
      this.isLoading = false;
      // 如果加载期间有挂起的 refresh 请求，执行它
      if (this._pendingRefreshId) {
        const pendingId = this._pendingRefreshId;
        this._pendingRefreshId = null;
        await this.loadFolder(pendingId);
        return;
      }
    }
  }

  async refresh() {
    const current = Router.getCurrent();
    if (!current) return;

    // 如果正在加载，等待当前加载完成后重新加载
    if (this.isLoading) {
      this._pendingRefreshId = current.id;
      return;
    }

    await this.loadFolder(current.id);
  }

  renderEmpty() {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="empty-icon">${iconSvg('folder')}</div>
      <div class="empty-text">文件夹为空</div>
      <div class="empty-hint">点击"新建书签"添加第一个书签</div>
    `;
    this.grid.appendChild(empty);
  }

  async createBookmark(parentId, title, url) {
    try {
      const bookmark = await BookmarkStore.create(parentId, title, url);
      await this.refresh();
      return bookmark;
    } catch (err) {
      console.error('Failed to create bookmark:', err);
    }
  }

  async createFolder(parentId, title) {
    try {
      const folder = await BookmarkStore.create(parentId, title);
      await this.refresh();
      return folder;
    } catch (err) {
      console.error('Failed to create folder:', err);
    }
  }

  async deleteCard(id, isFolder) {
    const card = this.cards.get(id);
    if (!card) return;

    await card.animateDelete();
    await BookmarkStore.remove(id, isFolder);
    this.cards.delete(id);
    this.selectedCards.delete(id);
  }

  applyOptimisticReorder(draggedId, targetId, position) {
    const dragged = this.cards.get(draggedId)?.element;
    const target = this.cards.get(targetId)?.element;
    if (!dragged || !target || dragged === target) return;

    // FLIP 动画要自己写 inline transform，先让卡片光效交出 gsap 的 transform，
    // 否则两边同时改同一个属性会出现跳动。
    this.cards.forEach((card) => card.releaseEffectsTransform());

    const previousRects = new Map();
    this.grid.querySelectorAll('.bookmark-card').forEach(card => {
      previousRects.set(card, card.getBoundingClientRect());
    });

    if (position === 'before') {
      this.grid.insertBefore(dragged, target);
    } else {
      this.grid.insertBefore(dragged, target.nextSibling);
    }

    this.grid.querySelectorAll('.bookmark-card').forEach(card => {
      const previous = previousRects.get(card);
      if (!previous) return;
      const next = card.getBoundingClientRect();
      const dx = previous.left - next.left;
      const dy = previous.top - next.top;
      if (!dx && !dy) return;

      card.style.transform = `translate(${dx}px, ${dy}px)`;
      card.style.transition = 'transform 0s';
      requestAnimationFrame(() => {
        card.style.transform = '';
        card.style.transition = 'transform 180ms cubic-bezier(0.2, 0, 0, 1)';
        window.setTimeout(() => {
          card.style.transition = '';
        }, 200);
      });
    });
  }

  clearSelection() {
    this.selectedCards.forEach(id => {
      const card = this.cards.get(id);
      if (card) {
        card.selected = false;
        card.element.classList.remove('selected');
      }
    });
    this.selectedCards.clear();
  }

  selectAll() {
    this.cards.forEach((card, id) => {
      if (!card.isFolder) {
        card.selected = true;
        card.element.classList.add('selected');
        this.selectedCards.add(id);
      }
    });
  }

  deleteSelected() {
    this.selectedCards.forEach((id) => {
      const card = this.cards.get(id);
      if (card) {
        EventBus.emit('card:requestDelete', {
          id,
          isFolder: card.isFolder,
          title: card.data.title
        });
      }
    });
  }
}

export default BookmarkGrid;
