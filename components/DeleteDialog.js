import EventBus from '../core/EventBus.js';
import BookmarkStore from '../core/BookmarkStore.js';

class DeleteDialog {
  constructor(grid) {
    this.grid = grid;
    this.request = 0;
    this.items = [];
    this.dialog = document.getElementById('delete-confirm-dialog');
    this.confirm = document.getElementById('delete-confirm-btn');
    this.message = document.getElementById('delete-confirm-message');
    this.status = document.createElement('div');
    this.status.className = 'dialog-status';
    this.status.setAttribute('role', 'status');
    this.retry = document.createElement('button');
    this.retry.type = 'button';
    this.retry.className = 'btn btn-secondary hidden';
    this.retry.textContent = '重试';
    const footer = this.dialog.querySelector('.dialog-footer');
    footer.prepend(this.status);
    footer.insertBefore(this.retry, this.confirm);
    this.retry.onclick = () => this.load();
    this.confirm.onclick = () => this.save();
    this.dialog
      .querySelectorAll('[data-action="close"], [data-action="cancel"], .dialog-overlay')
      .forEach((button) => button.addEventListener('click', () => this.hide()));
    EventBus.on('card:requestDelete', (payload) => this.show(payload));
  }

  show({ id, ids, isFolder, title, returnFocus }) {
    this.request++;
    this.items = (ids || [id]).map((id) => {
      const card = this.grid.cards.get(id);
      return {
        id,
        isFolder: card?.isFolder ?? isFolder,
        title: card?.data.title || title || '书签'
      };
    });
    this.returnFocus = returnFocus || this.grid.cards.get(id)?.element || document.activeElement;
    this.dialog.classList.remove('hidden');
    this.dialog.querySelector('[data-action="cancel"]').focus();
    void this.load();
  }

  async load() {
    const request = ++this.request;
    this.ready = false;
    this.confirm.disabled = true;
    this.retry.classList.add('hidden');
    this.status.textContent = '';
    this.status.classList.remove('error');
    this.message.textContent = '正在读取书签信息…';
    try {
      const counts = await Promise.all(
        this.items.map(async (item) => {
          if (!item.isFolder) return 0;
          const node = await BookmarkStore.getNode(item.id);
          if (!node || node.url) throw Error('Folder no longer exists');
          item.title = node.title || item.title;
          return BookmarkStore.countDescendants(node);
        })
      );
      if (request !== this.request) return;
      const count = counts.reduce((sum, n) => sum + n, 0),
        subject =
          this.items.length === 1 ? `“${this.items[0].title}”` : `所选 ${this.items.length} 项`;
      this.message.textContent = `删除${subject}？${this.items.some(item => item.isFolder) ? `包含 ${count} 个子项。` : ''}此操作会同步到浏览器书签。`;
      this.ready = true;
      this.confirm.disabled = false;
    } catch {
      if (request !== this.request) return;
      this.message.textContent = '暂时无法确认要删除的项目。';
      this.status.textContent = '信息读取失败，请重试。';
      this.status.classList.add('error');
      this.retry.classList.remove('hidden');
    }
  }

  async save() {
    if (!this.ready || this.confirm.disabled) return;
    const request = this.request,
      items = this.items;
    this.confirm.disabled = true;
    this.confirm.setAttribute('aria-busy', 'true');
    this.status.classList.remove('error');
    try {
      while (items.length && request === this.request) {
        this.status.textContent = `正在删除，剩余 ${items.length} 项…`;
        if (!(await this.grid.deleteCard(items[0].id, items[0].isFolder)))
          throw Error('Delete failed');
        items.shift();
      }
      if (request === this.request) {
        this.grid.clearSelection();
        this.hide();
      }
    } catch {
      if (request === this.request) {
        this.message.textContent = `剩余 ${items.length} 项尚未删除。`;
        this.status.textContent = '删除失败，请重试。';
        this.status.classList.add('error');
        this.confirm.disabled = false;
      }
    } finally {
      if (request === this.request) this.confirm.setAttribute('aria-busy', 'false');
    }
  }

  hide() {
    this.request++;
    this.items = [];
    this.ready = false;
    this.dialog.classList.add('hidden');
    this.confirm.disabled = true;
    this.confirm.setAttribute('aria-busy', 'false');
    this.status.textContent = '';
    this.status.classList.remove('error');
    if (
      this.returnFocus?.isConnected &&
      !this.returnFocus.disabled &&
      !this.returnFocus.closest('[inert], [hidden], .hidden')
    )
      this.returnFocus.focus();
    else document.getElementById('organize-trigger')?.focus();
  }
}

export default DeleteDialog;
