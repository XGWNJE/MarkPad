/**
 * EditDialog - 新建/编辑书签弹窗
 */
import EventBus from '../core/EventBus.js';
import BookmarkStore from '../core/BookmarkStore.js';
import Router from '../core/Router.js';

class EditDialog {
  constructor() {
    this.dialog = document.getElementById('edit-dialog');
    this.titleInput = document.getElementById('edit-title');
    this.urlInput = document.getElementById('edit-url');
    this.dialogTitle = document.getElementById('edit-dialog-title');
    this.confirmBtn = document.getElementById('edit-dialog-confirm');
    this.isEditMode = false;
    this.currentId = null;
    this.currentParentId = null;

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
      if (!this.dialog.classList.contains('hidden')) {
        if (e.key === 'Escape') {
          this.hide();
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.confirm();
        }
      }
    });

    // 监听事件
    EventBus.on('toolbar:newBookmark', () => this.showNew());
    EventBus.on('toolbar:newFolder', () => this.showNewFolder());
  }

  showNew() {
    this.isEditMode = false;
    this.dialogTitle.textContent = '新建书签';
    this.confirmBtn.textContent = '创建';
    this.titleInput.value = '';
    this.urlInput.value = '';
    this.urlInput.parentElement.style.display = 'block';
    this.currentId = null;
    this.currentParentId = Router.getCurrent().id;

    this.dialog.classList.remove('hidden');
    this.titleInput.focus();
  }

  showNewFolder() {
    this.isEditMode = false;
    this.dialogTitle.textContent = '新建文件夹';
    this.confirmBtn.textContent = '创建';
    this.titleInput.value = '';
    this.urlInput.parentElement.style.display = 'none';
    this.currentId = null;
    this.currentParentId = Router.getCurrent().id;

    this.dialog.classList.remove('hidden');
    this.titleInput.focus();
  }

  async confirm() {
    const title = this.titleInput.value.trim();
    if (!title) {
      this.titleInput.focus();
      return;
    }

    if (this.isEditMode) {
      // 编辑模式
      const url = this.urlInput.value.trim();
      await BookmarkStore.update(this.currentId, title, url || undefined);
    } else {
      // 新建模式
      if (this.urlInput.parentElement.style.display !== 'none') {
        // 书签
        const url = this.normalizeUrl(this.urlInput.value.trim());
        if (!url) {
          this.urlInput.focus();
          return;
        }
        EventBus.emit('bookmark:create', { parentId: this.currentParentId, title, url });
      } else {
        // 文件夹
        EventBus.emit('folder:create', { parentId: this.currentParentId, title });
      }
    }

    this.hide();
  }

  hide() {
    this.dialog.classList.add('hidden');
    this.urlInput.parentElement.style.display = 'block';
    this.isEditMode = false;
    this.currentId = null;
  }

  normalizeUrl(value) {
    if (!value) return null;
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
    try {
      return new URL(withScheme).href;
    } catch {
      return null;
    }
  }
}

export default EditDialog;
