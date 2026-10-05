/**
 * BookmarkGrid - 书签网格渲染与交互
 */
import EventBus from '../core/EventBus.js';
import BookmarkStore from '../core/BookmarkStore.js';
import Router from '../core/Router.js';
import BookmarkCard from './BookmarkCard.js';
import { iconSvg } from '../core/IconLibrary.js';
import { getMoveDestination, getPreviewOrder } from '../core/DragOrder.js';
import GridDragController from './GridDragController.js';
import CardNavigation from './CardNavigation.js';

class BookmarkGrid {
  constructor() {
    this.grid = document.getElementById('bookmark-grid');
    this.cards = new Map();
    this.selectedCards = new Set();
    this.isLoading = false;
    this.loadGeneration = 0;
    this.pendingMoves = new Map();
    this.pendingDeletes = new Set();
    this.moveQueue = Promise.resolve();
    this.dragController = new GridDragController(this);

    this.ready = this.init();
  }

  init() {
    // 监听导航
    EventBus.on('navigate', async ({ id }) => {
      await this.loadFolder(id);
    });

    // 监听书签变更
    EventBus.on('created', () => this.refresh());
    EventBus.on('removed', ({ id }) => {
      if (!this.pendingDeletes.has(id)) this.refresh();
    });
    EventBus.on('changed', () => this.refresh());
    EventBus.on('moved', (move) => {
      const pending = this.pendingMoves.get(move.id);
      if (pending && move.parentId === pending.parentId && move.oldParentId === pending.oldParentId) {
        pending.eventSeen = true;
        return; // 本次 API 完成后必定核对，包含没有 onMoved 的原地移动。
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

    EventBus.on('card:rename', ({ id, title }) => {
      BookmarkStore.update(id, title).catch(err => {
        console.error('Rename failed:', err);
        this.dragController.showStatus('重命名失败，请重试');
      });
    });

    EventBus.on('icon:applied', ({ id, iconData }) => {
      const card = this.cards.get(id);
      if (card) {
        card.updateIcon(iconData);
      }
    });

    EventBus.on('siteIcon:backgroundApplied', ({ id }) => {
      const card = this.cards.get(id);
      if (card?.siteIconModel) {
        card.siteBackgroundPreview = null;
        card.updateIcon(card.siteIconModel);
      }
    });

    EventBus.on('siteIcon:backgroundPreview', ({ id, background }) => {
      const card = this.cards.get(id);
      if (!card?.siteIconModel) return;
      card.siteBackgroundPreview = background;
      card.updateIcon(card.siteIconModel);
    });

    EventBus.on('card:select', ({ id, selected }) => {
      if (selected) {
        this.selectedCards.add(id);
      } else {
        this.selectedCards.delete(id);
      }
    });

    EventBus.on('card:drop', operation => this.moveCard(operation));

    // 新建书签
    EventBus.on('bookmark:create', ({ parentId, title, url }) => {
      this.createBookmark(parentId, title, url);
    });

    // 新建文件夹
    EventBus.on('folder:create', ({ parentId, title }) => {
      this.createFolder(parentId, title);
    });

    // 初始加载（根节点 ID 启动时已由 Router 解析）
    return this.loadFolder(Router.getRootId());
  }

  async loadFolder(folderId) {
    const generation = ++this.loadGeneration;
    this.isLoading = true;
    const created = [];
    try {
      if (folderId !== Router.getRootId() && !await BookmarkStore.getNode(folderId)) {
        if (generation === this.loadGeneration) Router.goToIndex(0);
        return;
      }
      if (generation !== this.loadGeneration) return;
      const children = await BookmarkStore.getChildren(folderId);
      const folderChildCounts = children.some(child => !child.url)
        ? await BookmarkStore.getFolderChildCountMap()
        : new Map();
      if (generation !== this.loadGeneration) return;
      const nextCards = new Map();
      await Promise.all(children.map(async child => {
        let card = this.cards.get(child.id);
        if (card) {
          await card.update({ ...child, childCount: folderChildCounts.get(child.id) });
        } else {
          card = new BookmarkCard(child, this.grid, { childCount: folderChildCounts.get(child.id) });
          created.push(card);
          await card.render();
        }
        nextCards.set(child.id, card);
      }));
      if (generation !== this.loadGeneration) {
        created.forEach(card => card.destroy());
        return;
      }
      const changingFolder = this.currentFolderId !== undefined && this.currentFolderId !== folderId;
      CardNavigation.cancelFolderEntrance(this.grid);
      this.dragController.cancel();
      const previous = this.dragController.capturePositions();
      this.cards.forEach((card, id) => {
        if (!nextCards.has(id)) {
          card.destroy();
          this.selectedCards.delete(id);
        }
      });
      this.cards = new Map(children.map(child => [child.id, nextCards.get(child.id)]));
      for (let index = 0; index < children.length; index++) {
        const card = this.cards.get(children[index].id);
        if (this.grid.children[index] !== card.element) {
          this.grid.insertBefore(card.element, this.grid.children[index] || null);
        }
        card.resolveSiteIconWhenVisible();
      }
      this.renderCreateActions();
      this.currentFolderId = folderId;
      this.dragController.animateLayout(previous);
      if (changingFolder) CardNavigation.enterFolder(this.grid);
    } catch (err) {
      created.forEach(card => card.destroy());
      console.error('loadFolder failed:', err);
      if (generation === this.loadGeneration) this.dragController.showStatus('读取书签失败，请重试');
    } finally {
      if (generation === this.loadGeneration) this.isLoading = false;
    }
  }

  async refresh() {
    const current = Router.getCurrent();
    if (!current) return;

    await this.loadFolder(current.id);
  }

  moveCard(operation) {
    const task = this.moveQueue.then(() => this.performMove(operation));
    this.moveQueue = task.catch(() => {});
    return task;
  }

  async performMove({ draggedId, targetId, action, position }) {
    if (draggedId === targetId) return false;
    action = action === 'reorder' ? position : action;
    const previousFolderId = this.currentFolderId;
    const previousOrder = [...this.cards.keys()];
    try {
      const nodes = await chrome.bookmarks.get([draggedId, targetId]);
      const source = nodes.find(node => node.id === draggedId);
      const target = nodes.find(node => node.id === targetId);
      const destination = getMoveDestination(source, target, action);
      if (destination.noOp) return false;
      this.pendingMoves.set(draggedId, { ...destination, oldParentId: source.parentId });
      if (action !== 'into') this.applyOptimisticReorder(draggedId, targetId, action);
      await BookmarkStore.move(draggedId, destination.parentId, destination.index);
      await this.refresh();
      return true;
    } catch (err) {
      console.error('Move failed:', err);
      if (previousFolderId === this.currentFolderId) this.applyOrder(previousOrder);
      this.dragController.showStatus('移动失败，已恢复书签显示，请重试');
      await this.refresh();
      return false;
    } finally {
      this.pendingMoves.delete(draggedId);
    }
  }

  renderCreateActions() {
    if (this.createActions) {
      this.createActions.forEach(button => this.grid.appendChild(button));
      return;
    }
    this.createActions = [];
    const actions = [
      { kind: 'bookmark', icon: 'bookmark-plus', label: '新建书签', event: 'toolbar:newBookmark' },
      { kind: 'folder', icon: 'folder-plus', label: '新建文件夹', event: 'toolbar:newFolder' }
    ];

    for (const { kind, icon, label, event } of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'grid-create-card';
      button.dataset.createKind = kind;
      button.draggable = false;
      button.innerHTML = `
        <span class="grid-create-icon" aria-hidden="true">${iconSvg(icon)}</span>
        <span class="grid-create-label">${label}</span>
      `;
      button.addEventListener('click', () => EventBus.emit(event));
      this.grid.appendChild(button);
      this.createActions.push(button);
    }
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

    try {
      // 先确认写入成功；失败时卡片仍可操作。
      this.pendingDeletes.add(id);
      await BookmarkStore.remove(id, isFolder);
      await card.animateDelete();
      card.destroy();
      this.cards.delete(id);
      this.selectedCards.delete(id);
      await this.refresh();
    } catch (err) {
      console.error('Delete failed:', err);
      this.dragController.showStatus('删除失败，请重试');
      await this.refresh();
    } finally {
      this.pendingDeletes.delete(id);
    }
  }

  applyOptimisticReorder(draggedId, targetId, position) {
    const dragged = this.cards.get(draggedId)?.element;
    const target = this.cards.get(targetId)?.element;
    if (!dragged || !target || dragged === target) return;

    const previous = this.dragController.capturePositions();
    const ids = getPreviewOrder([...this.cards.keys()], draggedId, targetId, position);
    this.applyOrder(ids, previous);
  }

  applyOrder(ids, previous = this.dragController.capturePositions()) {
    const existing = ids.filter(id => this.cards.has(id));
    this.cards.forEach((_card, id) => { if (!existing.includes(id)) existing.push(id); });
    this.cards = new Map(existing.map(id => [id, this.cards.get(id)]));
    existing.forEach((id, index) => {
      const element = this.cards.get(id).element;
      if (this.grid.children[index] !== element) this.grid.insertBefore(element, this.grid.children[index] || null);
    });
    this.dragController.animateLayout(previous);
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
