/**
 * BookmarkCard - 单个卡片（书签 + 文件夹通用）
 */
import EventBus from '../core/EventBus.js';
import BookmarkStore from '../core/BookmarkStore.js';
import { iconSvg } from '../core/IconLibrary.js';
import { resolveBookmarkIcon } from '../core/icons/IconResolver.js';
import { isSvgRaw } from '../core/icons/IconSanitizer.js';
import { validateBitmapDimensions } from '../core/icons/BitmapIconProcessor.js';
import CardEffects from './CardEffects.js';

/** 将原始 SVG 文本应用到容器元素（注入 DOM，绕过 CSP） */
function applySvgToElement(el, svgText) {
  el.style.backgroundImage = '';
  el.style.backgroundSize = '';
  el.innerHTML = svgText;
  const svgEl = el.querySelector('svg');
  if (svgEl) {
    // 尺寸由 card.css 的 .card-icon svg 统一决定，这里只保证 SVG 以块级元素渲染
    svgEl.style.cssText = 'display:block;';
  }
}

/** 将 background-image 图标应用到容器元素 */
function applyImageToElement(el, url) {
  el.innerHTML = '';
  el.style.backgroundImage = `url(${url})`;
  el.style.backgroundSize = 'contain';
  el.style.backgroundPosition = 'center';
  el.style.backgroundRepeat = 'no-repeat';
}

function applyDefaultFolderIcon(el) {
  el.innerHTML = iconSvg('folder', { className: 'app-icon card-folder-svg' });
  el.style.backgroundImage = '';
  el.style.backgroundSize = '';
}

function applyInitialToElement(el, value) {
  el.innerHTML = '';
  el.style.backgroundImage = 'none';
  el.style.backgroundSize = '';
  const fallbackIcon = document.createElement('div');
  fallbackIcon.className = 'favicon-fallback';
  fallbackIcon.innerHTML = `<div class="favicon-initial">${escapeHtml(value || '?')}</div>`;
  fallbackIcon.style.display = 'flex';
  el.appendChild(fallbackIcon);
}

function applyIconModelToElement(el, model) {
  if (!model) {
    applyInitialToElement(el, '?');
    return;
  }

  if (model.type === 'svg') {
    applySvgToElement(el, model.value);
  } else if (model.type === 'image') {
    applyImageToElement(el, model.value);
  } else {
    applyInitialToElement(el, model.value);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 触屏没有 hover，无法靠 :hover 展开卡片文字。
 * 这里只维护“当前被点开的卡片”这一份状态，document 监听只注册一次，避免每张卡片各挂一个。
 */
let revealedCard = null;
let revealDismisserBound = false;

function bindRevealDismisser() {
  if (revealDismisserBound) return;
  revealDismisserBound = true;
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (revealedCard && !revealedCard.element.contains(event.target)) {
        revealedCard.hideText();
      }
    },
    true
  );
}

class BookmarkCard {
  constructor(data, container, options = {}) {
    this.data = data;
    this.container = container;
    this.options = options;
    this.element = null;
    this.isFolder = !data.url;
    this.selected = false;
    this.dragOver = false;
    this.isEditing = false;
    this.longPressTimer = null;
    this.longPressStart = null;
    this.suppressNextClick = false;
    this.currentDropPosition = null;
    this.effects = null;
    this.lastPointerType = null;
    this.textRevealed = false;
  }

  async render() {
    this.element = document.createElement('div');
    this.element.className = 'bookmark-card';
    this.element.setAttribute('tabindex', '0');
    this.element.setAttribute('data-id', this.data.id);
    this.element.setAttribute('draggable', 'true');

    if (this.isFolder) {
      this.element.classList.add('folder');
    }

    // 图标包装
    const iconWrapper = document.createElement('div');
    iconWrapper.className = 'card-icon-wrapper';

    // 图标
    const icon = document.createElement('div');
    icon.className = 'card-icon';

    if (this.isFolder) {
      icon.classList.add('folder');
      const customIcon = BookmarkStore.getCustomIcon(this.data.id);
      if (customIcon) {
        if (isSvgRaw(customIcon)) {
          applySvgToElement(icon, customIcon);
        } else {
          applyImageToElement(icon, customIcon);
        }
      } else {
        icon.classList.add('folder-default');
        applyDefaultFolderIcon(icon);
      }
    } else {
      icon.classList.add('favicon');
      applyIconModelToElement(icon, resolveBookmarkIcon(this.data, { storage: BookmarkStore }));
    }

    iconWrapper.appendChild(icon);

    // 底部渐变
    const gradient = document.createElement('div');
    gradient.className = 'card-gradient';

    // 信息
    const info = document.createElement('div');
    info.className = 'card-info';

    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = this.data.title;
    title.title = this.data.title;

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    if (this.isFolder) {
      const count = this.options.childCount ?? 0;
      meta.textContent = `${count} 项`;
    } else {
      meta.textContent = this.getDomain(this.data.url);
    }

    info.appendChild(meta);
    info.appendChild(title);

    this.element.appendChild(iconWrapper);
    this.element.appendChild(gradient);
    this.element.appendChild(info);

    this.bindEvents();
    this.effects = CardEffects.attach(this.element);

    return this.element;
  }

  /** 拖拽排序 / FLIP 动画要自己写 transform，这里先把 gsap 的 transform 交还出去 */
  releaseEffectsTransform() {
    this.effects?.releaseTransform();
  }

  getDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  escapeHtml(text) {
    return escapeHtml(text);
  }

  bindEvents() {
    // 点击打开
    this.element.addEventListener('click', (e) => {
      if (this.isEditing) return;
      if (this.suppressNextClick) {
        this.suppressNextClick = false;
        e.preventDefault();
        return;
      }
      if (this.revealTextOnTap()) return;
      if (e.ctrlKey || e.metaKey) {
        this.toggleSelect();
      } else {
        this.open();
      }
    });

    // 双击编辑标题
    this.element.addEventListener('dblclick', () => {
      if (!this.isFolder) {
        const titleEl = this.element.querySelector('.card-title');
        this.startEdit(titleEl);
      }
    });

    // 拖拽
    this.element.addEventListener('dragstart', (e) => {
      this.cancelLongPress();
      this.element.classList.add('is-dragging');
      e.dataTransfer.setData('text/plain', this.data.id);
      e.dataTransfer.effectAllowed = 'move';
      EventBus.emit('card:dragstart', { id: this.data.id, isFolder: this.isFolder });
    });

    this.element.addEventListener('dragend', () => {
      this.element.classList.remove('is-dragging');
      this.element.classList.remove('drag-over');
      EventBus.emit('card:dragend', { id: this.data.id });
    });

    this.element.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const draggedId = e.dataTransfer.types.includes('text/plain') ? true : false;
      if (!draggedId) return;

      this.clearDropIndicator();

      if (this.isFolder) {
        const rect = this.element.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const zone = y / rect.height;

        if (zone < 0.25) {
          this.showDropIndicator('before');
        } else if (zone > 0.75) {
          this.showDropIndicator('after');
        } else {
          this.element.classList.add('drag-over');
        }
      } else {
        const rect = this.element.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const half = x / rect.width;

        if (half < 0.5) {
          this.showDropIndicator('before');
        } else {
          this.showDropIndicator('after');
        }
      }
    });

    this.element.addEventListener('dragleave', (e) => {
      if (!this.element.contains(e.relatedTarget)) {
        this.element.classList.remove('drag-over');
        this.clearDropIndicator();
      }
    });

    this.element.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const draggedId = e.dataTransfer.getData('text/plain');
      if (!draggedId || draggedId === this.data.id) {
        this.clearDropIndicator();
        this.element.classList.remove('drag-over');
        return;
      }

      const dropPosition = this.element.dataset.dropPosition;
      this.clearDropIndicator();
      this.element.classList.remove('drag-over');

      if (this.isFolder && !dropPosition) {
        EventBus.emit('card:drop', {
          draggedId,
          targetId: this.data.id,
          action: 'into'
        });
      } else {
        EventBus.emit('card:drop', {
          draggedId,
          targetId: this.data.id,
          action: 'reorder',
          position: dropPosition || 'after'
        });
      }
    });

    // 键盘
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.open();
      } else if (e.key === 'Delete') {
        EventBus.emit('card:requestDelete', {
          id: this.data.id,
          isFolder: this.isFolder,
          title: this.data.title
        });
      } else if (e.key === 'F2') {
        const titleEl = this.element.querySelector('.card-title');
        this.startEdit(titleEl);
      }
    });

    // 右键菜单
    this.element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showContextMenu(e.clientX, e.clientY);
    });

    this.element.addEventListener('pointerdown', (e) => {
      this.lastPointerType = e.pointerType;
      this.startLongPress(e);
    });
    this.element.addEventListener('pointermove', (e) => this.handleLongPressMove(e));
    this.element.addEventListener('pointerup', () => this.cancelLongPress());
    this.element.addEventListener('pointercancel', () => this.cancelLongPress());
    this.element.addEventListener('pointerleave', () => this.cancelLongPress());
  }

  startLongPress(e) {
    if (this.isEditing || (e.pointerType !== 'touch' && e.pointerType !== 'pen')) return;
    this.cancelLongPress();
    this.longPressStart = { x: e.clientX, y: e.clientY };
    this.longPressTimer = window.setTimeout(() => {
      this.suppressNextClick = true;
      this.showContextMenu(e.clientX, e.clientY);
    }, 550);
  }

  // ========== 卡片文字展开（悬停 / 键盘聚焦 / 触屏点按） ==========

  /**
   * 触屏和手写笔没有悬停：第一次点按先把标题展开，再点一次才执行打开或多选。
   * 鼠标路径由 card.css 的 :hover / :focus-visible 负责，这里不做拦截。
   * @returns {boolean} 是否消费了这次点击
   */
  revealTextOnTap() {
    if (this.textRevealed) return false;
    if (this.lastPointerType !== 'touch' && this.lastPointerType !== 'pen') return false;
    this.revealText();
    return true;
  }

  revealText() {
    if (revealedCard && revealedCard !== this) revealedCard.hideText();
    bindRevealDismisser();
    revealedCard = this;
    this.textRevealed = true;
    this.element.classList.add('text-revealed');
  }

  hideText() {
    if (revealedCard === this) revealedCard = null;
    this.textRevealed = false;
    this.element.classList.remove('text-revealed');
  }

  handleLongPressMove(e) {
    if (!this.longPressTimer || !this.longPressStart) return;
    const dx = Math.abs(e.clientX - this.longPressStart.x);
    const dy = Math.abs(e.clientY - this.longPressStart.y);
    if (dx > 10 || dy > 10) {
      this.cancelLongPress();
    }
  }

  cancelLongPress() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.longPressStart = null;
  }

  open() {
    if (this.isFolder) {
      EventBus.emit('card:openFolder', { id: this.data.id, title: this.data.title });
    } else {
      const openInCurrent = localStorage.getItem('openMode') === 'current';
      if (openInCurrent) {
        chrome.tabs.update({ url: this.data.url });
      } else {
        chrome.tabs.create({ url: this.data.url, active: false });
      }
    }
  }

  showDropIndicator(position) {
    if (this.currentDropPosition === position && this.element.querySelector('.drop-indicator')) {
      return;
    }
    this.clearDropIndicator();
    this.currentDropPosition = position;
    this.element.dataset.dropPosition = position;
    const indicator = document.createElement('div');
    indicator.className = `drop-indicator ${position === 'before' ? 'left' : 'right'}`;
    this.element.appendChild(indicator);
  }

  clearDropIndicator() {
    this.currentDropPosition = null;
    delete this.element.dataset.dropPosition;
    this.element.querySelectorAll('.drop-indicator').forEach(el => el.remove());
    this.element.classList.remove('drag-over');
  }

  toggleSelect() {
    this.selected = !this.selected;
    this.element.classList.toggle('selected', this.selected);
    EventBus.emit('card:select', {
      id: this.data.id,
      selected: this.selected
    });
  }

  startEdit(titleEl) {
    this.isEditing = true;
    titleEl.contentEditable = 'true';
    titleEl.focus();

    const range = document.createRange();
    range.selectNodeContents(titleEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const finishEdit = async () => {
      this.isEditing = false;
      titleEl.contentEditable = 'false';
      const newTitle = titleEl.textContent.trim();
      if (newTitle && newTitle !== this.data.title) {
        EventBus.emit('card:rename', {
          id: this.data.id,
          title: newTitle
        });
      }
      titleEl.textContent = newTitle || this.data.title;
    };

    titleEl.addEventListener('blur', finishEdit, { once: true });
    titleEl.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        titleEl.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        titleEl.textContent = this.data.title;
        titleEl.blur();
      }
    });
  }

  async update(data) {
    this.data = { ...this.data, ...data };
    const titleEl = this.element.querySelector('.card-title');
    titleEl.textContent = this.data.title;
    titleEl.title = this.data.title;

    const metaEl = this.element.querySelector('.card-meta');
    if (this.isFolder) {
      const children = await BookmarkStore.getChildren(this.data.id);
      metaEl.textContent = `${children.length} 项`;
    } else {
      metaEl.textContent = this.getDomain(this.data.url);
    }
  }

  animateCreate() {
    this.element.classList.add('adding');
  }

  // ========== 右键菜单 ==========

  showContextMenu(x, y) {
    document.querySelectorAll('.context-menu').forEach(el => el.remove());

    const menu = document.createElement('div');
    menu.className = 'context-menu';

    const hasCustomIcon = BookmarkStore.getCustomIcon(this.data.id);

    const items = [
      {
        label: '编辑名称',
        action: () => {
          const titleEl = this.element.querySelector('.card-title');
          this.startEdit(titleEl);
        }
      },
      {
        label: '移动到文件夹...',
        action: () => EventBus.emit('card:move', { id: this.data.id })
      },
      { type: 'separator' },
      ...(!this.isFolder ? [{
        label: '图标：重新匹配默认图标',
        action: () => this.refreshDefaultIcon()
      }] : []),
      {
        label: '图标：匹配本地图标',
        action: () => EventBus.emit('iconStudio:openLocal', {
          bookmark: this.data
        })
      },
      {
        label: '图标：搜索 SVG',
        action: () => EventBus.emit('iconStudio:open', {
          bookmark: this.data
        })
      },
      {
        label: '图标：上传高清图片',
        action: () => this.uploadBitmapIcon()
      },
    ];

    if (hasCustomIcon) {
      items.push({
        label: '图标：恢复默认',
        action: () => this.removeCustomIcon()
      });
    }

    items.push(
      { type: 'separator' },
      {
        label: '删除',
        className: 'danger',
        action: () => EventBus.emit('card:requestDelete', {
          id: this.data.id,
          isFolder: this.isFolder,
          title: this.data.title
        })
      }
    );

    items.forEach(item => {
      if (item.type === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'context-menu-separator';
        menu.appendChild(sep);
      } else {
        const menuItem = document.createElement('div');
        menuItem.className = `context-menu-item ${item.className || ''}`;
        menuItem.textContent = item.label;
        menuItem.addEventListener('click', (e) => {
          e.stopPropagation();
          menu.remove();
          item.action();
        });
        menu.appendChild(menuItem);
      }
    });

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    document.body.appendChild(menu);

    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menu.style.left = `${window.innerWidth - rect.width - 8}px`;
      }
      if (rect.bottom > window.innerHeight) {
        menu.style.top = `${window.innerHeight - rect.height - 8}px`;
      }
    });

    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
        document.removeEventListener('contextmenu', closeMenu);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
      document.addEventListener('contextmenu', closeMenu);
    }, 0);
  }

  /** 上传自定义位图图标 */
  uploadBitmapIcon() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/avif,image/x-icon';

    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 1024 * 1024) {
        this._showToast('图标文件不能超过 1MB');
        return;
      }
      if (file.size < 1024) {
        this._showToast('图标文件不能小于 1KB');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const validation = validateBitmapDimensions(img.naturalWidth, img.naturalHeight);
          if (!validation.ok) {
            this._showToast(validation.reason);
            return;
          }
          const canvas = document.createElement('canvas');
          const size = 256;
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext('2d');
          const scale = Math.min(size / img.width, size / img.height);
          const w = img.width * scale, h = img.height * scale;
          ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
          const dataUrl = canvas.toDataURL('image/png');
          BookmarkStore.setCustomIcon(this.data.id, dataUrl);
          this.updateIcon(dataUrl);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });

    input.click();
  }

  /**
   * 显示临时提示
   */
  _showToast(message, duration = 2000) {
    const existing = document.querySelector('.bookmark-card-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'bookmark-card-toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.8);
      color: #fff;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 13px;
      z-index: 9999;
      pointer-events: none;
      animation: bookmarkCardToastIn 0.2s ease;
    `;
    document.body.appendChild(toast);

    // 复用已存在的 toast 样式，避免每次创建新的 <style> 元素
    if (!document.getElementById('bookmark-card-toast-styles')) {
      const style = document.createElement('style');
      style.id = 'bookmark-card-toast-styles';
      style.textContent = '@keyframes bookmarkCardToastIn{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
      document.head.appendChild(style);
    }

    setTimeout(() => toast.remove(), duration);
  }

  /**
   * 移除自定义图标，恢复默认
   */
  removeCustomIcon() {
    BookmarkStore.removeCustomIcon(this.data.id);
    if (this.isFolder) {
      // 文件夹：恢复默认 SVG
      this.updateIcon(null);
    } else {
      this.updateIcon(resolveBookmarkIcon(this.data, { storage: BookmarkStore }));
    }
  }

  /**
   * 重新匹配默认图标（清除自动解析缓存后重新匹配图标库）
   */
  async refreshDefaultIcon() {
    const iconEl = this.element.querySelector('.card-icon');

    if (iconEl) iconEl.style.opacity = '0';

    BookmarkStore.clearResolvedIcon(this.data.id);

    this.updateIcon(resolveBookmarkIcon(this.data, { storage: BookmarkStore }));
    if (iconEl) {
      iconEl.style.transition = 'opacity 0.15s';
      iconEl.style.opacity = '1';
    }
  }

  /**
   * 更新卡片图标显示
   * @param {object|string|null} iconData - 解析模型 / 原始 SVG 文本 / data URL / null（恢复默认）
   */
  updateIcon(iconData) {
    const iconEl = this.element.querySelector('.card-icon');
    if (!iconEl) return;

    if (iconData && typeof iconData === 'object' && iconData.type) {
      if (this.isFolder && iconData.type === 'initial') {
        iconEl.classList.add('folder-default');
        applyDefaultFolderIcon(iconEl);
      } else {
        iconEl.classList.remove('folder-default');
        applyIconModelToElement(iconEl, iconData);
      }
      return;
    }

    if (this.isFolder) {
      if (iconData) {
        iconEl.classList.remove('folder-default');
        if (isSvgRaw(iconData)) {
          applySvgToElement(iconEl, iconData);
        } else {
          applyImageToElement(iconEl, iconData);
        }
      } else {
        // 恢复默认文件夹图标
        iconEl.classList.add('folder-default');
        applyDefaultFolderIcon(iconEl);
      }
    } else {
      if (iconData) {
        if (isSvgRaw(iconData)) {
          applySvgToElement(iconEl, iconData);
        } else {
          applyImageToElement(iconEl, iconData);
        }
      } else {
        applyIconModelToElement(iconEl, resolveBookmarkIcon(this.data, { storage: BookmarkStore }));
      }
    }
  }

  animateDelete() {
    return new Promise((resolve) => {
      this.element.classList.add('deleting');
      setTimeout(() => {
        this.hideText();
        this.effects?.destroy();
        this.effects = null;
        this.element.remove();
        resolve();
      }, 300);
    });
  }

  animateShake() {
    this.element.classList.add('shake');
    setTimeout(() => {
      this.element.classList.remove('shake');
    }, 400);
  }
}

export default BookmarkCard;
