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
    this.currentTitle = null;
    this.returnFocus = null;
    this.isSaving = false;
    this.showRequest = 0;
    this.status = document.createElement('div');
    this.status.className = 'dialog-status';
    this.status.id = 'edit-dialog-status';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.dialog.querySelector('.dialog-footer').prepend(this.status);
    this.titleInput.setAttribute('aria-describedby', this.status.id);
    this.urlInput.setAttribute('aria-describedby', this.status.id);
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-labelledby', 'edit-dialog-title');

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
    [this.titleInput, this.urlInput].forEach(input => input.addEventListener('input', () => {
      input.removeAttribute('aria-invalid');
      if (!this.isSaving) this.setStatus('');
    }));

    // 键盘
    document.addEventListener('keydown', (e) => {
      if (!this.dialog.classList.contains('hidden') && this.dialog.contains(e.target)) {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.hide();
        } else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.target.tagName === 'INPUT') {
          e.preventDefault();
          this.confirm();
        }
      }
    });

    // 监听事件
    EventBus.on('toolbar:newBookmark', () => this.showNew());
    EventBus.on('toolbar:newFolder', () => this.showNewFolder());
    EventBus.on('card:editTitle', (card) => this.showEditTitle(card));
  }

  showNew() {
    this.beginSession();
    this.isEditMode = false;
    this.returnFocus = document.activeElement;
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
    this.beginSession();
    this.isEditMode = false;
    this.returnFocus = document.activeElement;
    this.dialogTitle.textContent = '新建文件夹';
    this.confirmBtn.textContent = '创建';
    this.titleInput.value = '';
    this.urlInput.parentElement.style.display = 'none';
    this.currentId = null;
    this.currentParentId = Router.getCurrent().id;

    this.dialog.classList.remove('hidden');
    this.titleInput.focus();
  }

  showEditTitle({ id, title, isFolder, returnFocus }) {
    this.beginSession();
    this.isEditMode = true;
    this.currentId = id;
    this.currentTitle = title;
    this.returnFocus = returnFocus || document.activeElement;
    this.dialogTitle.textContent = isFolder ? '编辑文件夹名称' : '编辑书签名称';
    this.confirmBtn.textContent = '保存';
    this.titleInput.value = title;
    this.urlInput.parentElement.style.display = 'none';

    this.dialog.classList.remove('hidden');
    this.titleInput.focus();
    this.titleInput.select();
  }

  async confirm() {
    if (this.isSaving) return;
    const title = this.titleInput.value.trim();
    if (!title) {
      this.setStatus('请输入名称。', true);
      this.titleInput.setAttribute('aria-invalid', 'true');
      this.titleInput.focus();
      return;
    }
    if (this.isEditMode && title === this.currentTitle) {
      this.hide();
      return;
    }

    const isBookmark = !this.isEditMode && this.urlInput.parentElement.style.display !== 'none';
    const url = isBookmark ? this.normalizeUrl(this.urlInput.value.trim()) : undefined;
    if (isBookmark && !url) {
      this.setStatus('请输入有效的网址。', true);
      this.urlInput.setAttribute('aria-invalid', 'true');
      this.urlInput.focus();
      return;
    }
    if (!this.isEditMode) {
      EventBus.emit(isBookmark ? 'bookmark:create' : 'folder:create', {
        parentId: this.currentParentId, title, ...(isBookmark && { url })
      });
      this.hide();
      return;
    }

    const request = this.showRequest;
    this.setBusy(true);
    this.setStatus('正在保存…');
    try {
      await BookmarkStore.update(this.currentId, title);
      if (request === this.showRequest) this.hide();
    } catch {
      if (request === this.showRequest) this.setStatus('保存失败，请重试。', true);
    } finally {
      if (request === this.showRequest) this.setBusy(false);
    }
  }

  beginSession() {
    this.showRequest++;
    this.setBusy(false);
    this.setStatus('');
    this.titleInput.removeAttribute('aria-invalid');
    this.urlInput.removeAttribute('aria-invalid');
  }

  setBusy(busy) {
    this.isSaving = busy;
    this.confirmBtn.disabled = busy;
    this.confirmBtn.setAttribute('aria-busy', String(busy));
    this.titleInput.disabled = busy;
    this.urlInput.disabled = busy;
  }

  setStatus(message, isError = false) {
    this.status.textContent = message;
    this.status.classList.toggle('error', isError);
  }

  hide() {
    this.showRequest++;
    this.setBusy(false);
    this.dialog.classList.add('hidden');
    this.urlInput.parentElement.style.display = 'block';
    this.setStatus('');
    this.titleInput.removeAttribute('aria-invalid');
    this.urlInput.removeAttribute('aria-invalid');
    this.isEditMode = false;
    this.currentId = null;
    this.currentTitle = null;
    if (this.returnFocus?.isConnected && !this.returnFocus.closest?.('[inert], .hidden')) this.returnFocus.focus();
    else document.getElementById('menu-trigger')?.focus();
    this.returnFocus = null;
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
