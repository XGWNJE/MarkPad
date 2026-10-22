/**
 * MoveDialog - 移动书签目标选择弹窗
 */
import EventBus from '../core/EventBus.js';
import BookmarkStore from '../core/BookmarkStore.js';
import { iconSvg } from '../core/IconLibrary.js';

class MoveDialog {
  constructor() {
    this.dialog = document.getElementById('move-dialog');
    this.treeContainer = document.getElementById('move-dialog-tree');
    this.confirmBtn = document.getElementById('move-dialog-confirm');
    this.position = document.getElementById('move-position');
    this.positionRequest = 0;
    this.currentId = null;
    this.selectedTargetId = null;
    this.currentParentId = null;
    this.returnFocus = null;
    this.showRequest = 0;
    this.isSaving = false;
    this.status = document.createElement('div');
    this.status.className = 'dialog-status';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.dialog.querySelector('.dialog-footer').prepend(this.status);
    const heading = this.dialog.querySelector('.dialog-header h3');
    heading.id = 'move-dialog-title';
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-labelledby', heading.id);

    this.init();
  }

  init() {
    // 关闭
    this.dialog.querySelectorAll('[data-action="close"], [data-action="cancel"]').forEach(btn => {
      btn.addEventListener('click', () => this.hide());
    });

    this.dialog.querySelector('.dialog-overlay').addEventListener('click', () => {
      this.hide();
    });

    // 确认
    this.confirmBtn.addEventListener('click', () => this.confirm());

    // 键盘
    document.addEventListener('keydown', (e) => {
      if (!this.dialog.classList.contains('hidden') && this.dialog.contains(e.target)) {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.hide();
        }
      }
    });

    // 监听右键菜单"移动到..."事件
    EventBus.on('card:move', ({ id, ids, returnFocus }) => this.show(ids || id, returnFocus));
  }

  async show(id, returnFocus) {
    const request = ++this.showRequest;
    this.returnFocus = returnFocus || document.activeElement;
    this.currentIds = [].concat(id);
    this.currentId = this.currentIds[0];
    this.selectedTargetId = null;
    this.currentParentId = null;
    this.setBusy(false);
    this.confirmBtn.disabled = true;
    this.treeContainer.textContent = '';
    this.treeContainer.setAttribute('aria-busy', 'true');
    this.setStatus('正在读取文件夹…');
    this.dialog.classList.remove('hidden');
    this.dialog.querySelector('[data-action="cancel"]').focus();

    // 获取文件夹树
    try {
      const [folders, source] = await Promise.all([
        BookmarkStore.getFolderTree(), BookmarkStore.getNode(this.currentId)
      ]);
      if (request !== this.showRequest) return;
      if (!source) throw new Error('Bookmark no longer exists');
      this.currentParentId = source.parentId;
      this.selectedTargetId = this.currentParentId;

      this.treeContainer.innerHTML = '';
      this.renderFolderTree(folders, this.treeContainer, 0);
      await this.loadPositions();
    } catch (error) {
      if (request !== this.showRequest) return;
      this.setStatus('文件夹读取失败，请关闭后重试。', true);
      console.error('Failed to load move targets:', error);
    } finally {
      if (request === this.showRequest) this.treeContainer.setAttribute('aria-busy', 'false');
    }
  }

  renderFolderTree(folders, container, depth) {
    folders.forEach(folder => {
      if (this.currentIds.includes(folder.id)) return;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'folder-tree-item';
      item.style.setProperty('--folder-depth', String(depth));
      item.title = folder.title;
      item.setAttribute('data-id', folder.id);
      item.setAttribute('aria-pressed', 'false');
      const isCurrent = folder.id === this.currentParentId;
      if (isCurrent) {
        item.setAttribute('data-current', 'true');
        item.classList.add('selected');
        item.setAttribute('aria-pressed', 'true');
      }

      const icon = document.createElement('span');
      icon.className = 'folder-icon';
      icon.innerHTML = iconSvg('folder');

      const name = document.createElement('span');
      name.className = 'folder-name';
      name.textContent = folder.title;

      item.appendChild(icon);
      item.appendChild(name);
      if (isCurrent) {
        const position = document.createElement('span');
        position.className = 'folder-current';
        position.textContent = '当前位置';
        item.appendChild(position);
      }

      item.addEventListener('click', () => {
        if (this.isSaving) return;
        this.treeContainer.querySelectorAll('.folder-tree-item').forEach(el => {
          el.classList.remove('selected');
          el.setAttribute('aria-pressed', 'false');
        });
        item.classList.add('selected');
        item.setAttribute('aria-pressed', 'true');
        this.selectedTargetId = folder.id;
        void this.loadPositions();
      });

      container.appendChild(item);

      if (folder.children && folder.children.length > 0) {
        this.renderFolderTree(folder.children, container, depth + 1);
      }
    });
  }

  async loadPositions() {
    const request = ++this.positionRequest, session = this.showRequest;
    this.confirmBtn.disabled = true;
    this.position.disabled = true;
    try {
      const children = await BookmarkStore.getChildren(this.selectedTargetId);
      if (request !== this.positionRequest || session !== this.showRequest) return;
      this.position.innerHTML = '';
      for (const [value, title] of [['last','放在最后'],['first','放在最前'], ...children.filter(node => !this.currentIds.includes(node.id)).map(node => [node.id, `${node.title} 之前`])]) {
        const option = document.createElement('option'); option.value=value; option.textContent=title; this.position.appendChild(option);
      }
      this.position.value='last'; this.position.disabled=false; this.confirmBtn.disabled=false; this.setStatus('');
    } catch {
      if (request === this.positionRequest && session === this.showRequest) this.setStatus('读取放置位置失败，请重新选择目录重试。', true);
    }
  }

  async confirm() {
    if (!this.selectedTargetId || this.isSaving || this.confirmBtn.disabled) return;
    const request = this.showRequest;
    const ids = [...this.currentIds], target = this.selectedTargetId, position = this.position.value;
    this.setBusy(true);
    this.setStatus('正在移动…');
    try {
      const children = position === 'first' ? await BookmarkStore.getChildren(target) : [];
      const beforeId = position === 'first' ? children.find(node => !ids.includes(node.id))?.id : position === 'last' ? null : position;
      for (const id of ids) {
        if (request !== this.showRequest) return;
        const before = beforeId ? await BookmarkStore.getNode(beforeId) : null;
        if (beforeId && (!before || before.parentId !== target)) throw Error('Position no longer exists');
        if (before) await BookmarkStore.move(id, target, before.index);
        else await BookmarkStore.move(id, target);
        if (request === this.showRequest) this.currentIds = this.currentIds.filter(item => item !== id);
      }
      EventBus.emit('grid:refresh');
      EventBus.emit('grid:organize', false);
      if (request === this.showRequest) this.hide();
    } catch (error) {
      if (request === this.showRequest) {
        this.setStatus(this.currentIds.length < ids.length ? `部分项目已移动，剩余 ${this.currentIds.length} 项，请重试。` : '移动失败，请重试。', true);
      }
      console.error('Failed to move bookmark:', error);
    } finally {
      if (request === this.showRequest) this.setBusy(false);
    }
  }

  setBusy(busy) {
    this.isSaving = busy;
    this.confirmBtn.disabled = busy || !this.selectedTargetId;
    this.confirmBtn.setAttribute('aria-busy', String(busy));
    this.treeContainer.querySelectorAll('.folder-tree-item').forEach(item => {
      item.disabled = busy;
    });
    this.position.disabled = busy;
  }

  setStatus(message, isError = false) {
    this.status.textContent = message;
    this.status.classList.toggle('error', isError);
  }

  hide() {
    this.showRequest++;
    this.dialog.classList.add('hidden');
    this.currentId = null;
    this.selectedTargetId = null;
    this.currentParentId = null;
    this.setBusy(false);
    this.setStatus('');
    this.treeContainer.setAttribute('aria-busy', 'false');
    if (this.returnFocus?.isConnected && !this.returnFocus.disabled && this.returnFocus.tabIndex !== -1 && !this.returnFocus.closest?.('[inert], [hidden], .hidden')) this.returnFocus.focus();
    else document.getElementById('more-trigger')?.focus();
    this.returnFocus = null;
  }
}

export default MoveDialog;
