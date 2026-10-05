/**
 * BookmarkCard - 单个卡片（书签 + 文件夹通用）
 */
import EventBus from '../core/EventBus.js';
import BookmarkStore from '../core/BookmarkStore.js';
import { iconSvg } from '../core/IconLibrary.js';
import { activateMenu, bindMenuKeyboard, releaseMenu } from '../core/MenuInteraction.js';
import { resolveBookmarkIcon } from '../core/icons/IconResolver.js';
import { isSvgRaw } from '../core/icons/IconSanitizer.js';
import { backgroundCssValue, getIconScale, normalizeIconBackground } from '../core/icons/IconBackground.js';
import { normalizeIconScale } from '../core/icons/IconUploadProcessor.js';
import { analyzeIconBackground } from '../core/icons/IconBackgroundAnalyzer.js';
import CardEffects from './CardEffects.js';
import CardNavigation from './CardNavigation.js';

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

/** 以受限图片元素展示远程或位图图标，保留浏览器原生动画播放。 */
function applyImageToElement(el, url) {
  el.innerHTML = '';
  el.style.backgroundImage = '';
  const image = document.createElement('img');
  image.className = 'card-icon-image';
  image.src = url;
  image.alt = '';
  image.referrerPolicy = 'no-referrer';
  el.appendChild(image);
}

function applyDefaultFolderIcon(el) {
  el.innerHTML = iconSvg('folder', { className: 'app-icon card-folder-svg' });
  el.style.backgroundImage = '';
  el.style.backgroundSize = '';
  el.style.removeProperty('--icon-content-scale');
}

function clearIconElement(el) {
  el.innerHTML = '';
  el.style.backgroundImage = 'none';
  el.style.backgroundSize = '';
  el.style.background = '';
  el.style.removeProperty('--icon-content-scale');
}

function applyIconModelToElement(el, model) {
  if (!model) {
    clearIconElement(el);
    return;
  }

  const background = normalizeIconBackground(model.background);
  const scale = normalizeIconScale(model.scale ?? getIconScale(background));

  if (model.type === 'svg') {
    applySvgToElement(el, model.value);
  } else if (model.type === 'image') {
    applyImageToElement(el, model.value);
  } else {
    clearIconElement(el);
  }
  const cssBackground = backgroundCssValue(background);
  el.style.background = cssBackground;
  el.style.setProperty('--icon-content-scale', String(scale));
}

/**
 * 触屏没有 hover，无法靠 :hover 展开卡片文字。
 * 这里只维护“当前被点开的卡片”这一份状态，document 监听只注册一次，避免每张卡片各挂一个。
 */
let revealedCard = null;
let revealDismisserBound = false;
let activeMenuOwner = null;

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
    this.childCount = options.childCount ?? 0;
    this.element = null;
    this.isFolder = !data.url;
    this.selected = false;
    this.longPressTimer = null;
    this.longPressStart = null;
    this.suppressNextClick = false;
    this.effects = null;
    this.lastPointerType = null;
    this.textRevealed = false;
    this.siteIconModel = null;
    this.siteBackgroundPreview = null;
    this.destroyed = false;
    this.interactionPaused = false;
    this.opening = false;
    this.eventAbortController = null;
    this.timers = new Set();
    this.frames = new Set();
    this.deleteResolve = null;
    this.deletePromise = null;
    this.updateVersion = 0;
    this.contextMenu = null;
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
        applyIconModelToElement(icon, resolveBookmarkIcon(this.data, { storage: BookmarkStore }));
      } else {
        icon.classList.add('folder-default');
        applyDefaultFolderIcon(icon);
      }
    } else {
      icon.classList.add('favicon');
      const iconModel = resolveBookmarkIcon(this.data, { storage: BookmarkStore });
      applyIconModelToElement(icon, iconModel);
      this.setIconAvailable(Boolean(iconModel));
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
      const count = this.childCount;
      meta.textContent = `${count} 项`;
    } else {
      meta.textContent = this.getDomain(this.data.url);
    }

    info.appendChild(title);
    info.appendChild(meta);

    const surface = document.createElement('div');
    surface.className = 'card-surface';
    surface.appendChild(iconWrapper);
    surface.appendChild(gradient);
    surface.appendChild(info);
    this.element.appendChild(surface);

    this.bindEvents();
    this.effects = CardEffects.attach(this.element);

    return this.element;
  }

  setIconAvailable(available) {
    this.element.classList.toggle('iconless', !available);
  }

  resolveSiteIconWhenVisible() {
    // 只能在卡片挂入页面后观察；在 render() 内观察脱离文档的节点，
    // Chrome 不会稳定地产生首个可见性交叉事件，结果就是网站图标永远不请求。
    if (this.destroyed || !this.element?.isConnected || this.isFolder || !this.data.url || this.siteIconObserver || (this.siteIconLoading && this.siteIconRequestedUrl === this.data.url)) return;
    const load = async () => {
      this.siteIconLoading = true;
      const requestedUrl = this.data.url;
      this.siteIconRequestedUrl = requestedUrl;
      try {
        // Custom and curated title icons can appear while this card waits.
        if (resolveBookmarkIcon(this.data, { storage: BookmarkStore })) return;
        const icon = await BookmarkStore.resolveSiteIcon(requestedUrl);
        if (icon && !this.destroyed && this.element?.isConnected && this.data.url === requestedUrl && !resolveBookmarkIcon(this.data, { storage: BookmarkStore })) {
          this.updateIcon(icon);
        }
      } catch (error) {
        console.warn('[MarkPad] Website icon background request failed; reload the extension and new tab.', error);
      } finally {
        if (this.siteIconRequestedUrl === requestedUrl) this.siteIconLoading = false;
      }
    };

    if (!('IntersectionObserver' in window)) {
      void load();
      return;
    }
    this.siteIconObserver = new IntersectionObserver(entries => {
      if (this.destroyed || !entries.some(entry => entry.isIntersecting)) return;
      this.siteIconObserver.disconnect();
      this.siteIconObserver = null;
      void load();
    }, { rootMargin: '160px' });
    this.siteIconObserver.observe(this.element);
  }

  /** 兼容入口：清除内层悬停效果；根卡片的排序变换由网格控制器管理。 */
  releaseEffectsTransform() {
    this.effects?.releaseTransform();
  }

  setInteractionPaused(paused) {
    if (this.destroyed) return;
    this.interactionPaused = Boolean(paused);
    if (this.interactionPaused) CardNavigation.cancel(this);
    this.element?.classList.toggle('interaction-paused', this.interactionPaused);
    this.effects?.setPaused(this.interactionPaused || this.opening);
    if (this.interactionPaused) {
      this.cancelLongPress();
      this.closeContextMenu();
    }
  }

  setOpening(opening) {
    this.opening = Boolean(opening);
    this.element?.classList.toggle('is-opening', this.opening);
    if (this.opening) this.element?.setAttribute('aria-busy', 'true');
    else this.element?.removeAttribute('aria-busy');
    this.effects?.setPaused(this.interactionPaused || this.opening);
  }

  schedule(callback, delay) {
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      if (!this.destroyed) callback();
    }, delay);
    this.timers.add(timer);
    return timer;
  }

  scheduleFrame(callback) {
    const frame = requestAnimationFrame(() => {
      this.frames.delete(frame);
      if (!this.destroyed) callback();
    });
    this.frames.add(frame);
    return frame;
  }

  clearTimer(timer) {
    if (timer === null || timer === undefined) return;
    window.clearTimeout(timer);
    this.timers.delete(timer);
  }

  motionDuration(key, fallback) {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return 0;
    const value = getComputedStyle(this.element).getPropertyValue(key).trim();
    const duration = Number.parseFloat(value);
    return Number.isFinite(duration) && duration >= 0
      ? duration * (value.endsWith('ms') ? 1 : 1000)
      : fallback;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    CardNavigation.cancel(this);
    this.cancelLongPress();
    this.closeContextMenu();
    this.hideText();
    this.siteIconObserver?.disconnect();
    this.siteIconObserver = null;
    this.eventAbortController?.abort();
    this.eventAbortController = null;
    this.timers.forEach(timer => window.clearTimeout(timer));
    this.timers.clear();
    this.frames.forEach(frame => cancelAnimationFrame(frame));
    this.frames.clear();
    CardEffects.detach(this.element);
    this.effects = null;
    this.element?.remove();
    const resolve = this.deleteResolve;
    this.deleteResolve = null;
    resolve?.();
  }

  getDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  bindEvents() {
    this.eventAbortController = new AbortController();
    const listenerOptions = { signal: this.eventAbortController.signal };
    // 点击打开
    this.element.addEventListener('click', (e) => {
      if (this.destroyed || this.interactionPaused || this.opening) {
        e.preventDefault();
        return;
      }
      if (this.suppressNextClick) {
        this.suppressNextClick = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (this.revealTextOnTap()) return;
      if (e.ctrlKey || e.metaKey) {
        this.toggleSelect();
      } else {
        this.open();
      }
    }, listenerOptions);

    // 拖拽
    this.element.addEventListener('dragstart', (e) => {
      if (this.destroyed || this.interactionPaused || this.opening) {
        e.preventDefault();
        return;
      }
      this.cancelLongPress();
      this.closeContextMenu();
      this.element.classList.add('is-dragging');
      e.dataTransfer.setData('text/plain', this.data.id);
      e.dataTransfer.effectAllowed = 'move';
      EventBus.emit('card:dragstart', { id: this.data.id, isFolder: this.isFolder });
    }, listenerOptions);

    this.element.addEventListener('dragend', () => {
      this.element.classList.remove('is-dragging');
      EventBus.emit('card:dragend', { id: this.data.id });
    }, listenerOptions);

    // 键盘
    this.element.addEventListener('keydown', (e) => {
      if (this.destroyed || this.interactionPaused || this.opening) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        this.open();
      } else if (e.key === 'Delete') {
        EventBus.emit('card:requestDelete', {
          id: this.data.id,
          isFolder: this.isFolder,
          title: this.data.title
        });
      } else if (e.key === 'F2') {
        e.preventDefault();
        this.startEdit();
      } else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
        e.preventDefault();
        const rect = this.element.getBoundingClientRect();
        this.showContextMenu(rect.left + 8, rect.top + 8);
      }
    }, listenerOptions);

    // 右键菜单
    this.element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showContextMenu(e.clientX, e.clientY);
    }, listenerOptions);

    this.element.addEventListener('pointerdown', (e) => {
      // 上一次长按可能以取消结束，没有产生要抑制的 click。
      this.suppressNextClick = false;
      this.lastPointerType = e.pointerType;
      this.startLongPress(e);
    }, listenerOptions);
    this.element.addEventListener('pointermove', (e) => this.handleLongPressMove(e), listenerOptions);
    this.element.addEventListener('pointerup', () => this.cancelLongPress(), listenerOptions);
    this.element.addEventListener('pointercancel', () => {
      this.cancelLongPress();
      this.suppressNextClick = false;
    }, listenerOptions);
    this.element.addEventListener('pointerleave', () => this.cancelLongPress(), listenerOptions);
  }

  startLongPress(e) {
    if (this.destroyed || this.interactionPaused) return;
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    this.cancelLongPress();
    this.longPressStart = { x: e.clientX, y: e.clientY };
    this.longPressTimer = this.schedule(() => {
      this.longPressTimer = null;
      this.longPressStart = null;
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
    this.element?.classList.remove('text-revealed');
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
      this.clearTimer(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.longPressStart = null;
  }

  open() {
    if (this.destroyed || this.interactionPaused) return Promise.resolve(false);
    this.cancelLongPress();
    this.closeContextMenu();
    if (this.isFolder) {
      return CardNavigation.open(this, {
        mode: 'folder',
        navigate: () => EventBus.emit('card:openFolder', { id: this.data.id, title: this.data.title })
      });
    } else {
      const url = this.data.url;
      const openInCurrent = localStorage.getItem('openMode') === 'current';
      if (openInCurrent) {
        return CardNavigation.open(this, {
          mode: 'current',
          prepare: () => chrome.tabs.getCurrent(),
          navigate: tab => {
            if (!Number.isInteger(tab?.id)) throw new Error('无法确定来源标签页');
            return chrome.tabs.update(tab.id, { url });
          }
        });
      } else {
        return CardNavigation.open(this, {
          mode: 'new',
          navigate: () => chrome.tabs.create({ url, active: false })
        });
      }
    }
  }

  toggleSelect() {
    this.selected = !this.selected;
    this.element.classList.toggle('selected', this.selected);
    EventBus.emit('card:select', {
      id: this.data.id,
      selected: this.selected
    });
  }

  startEdit() {
    EventBus.emit('card:editTitle', {
      id: this.data.id,
      title: this.data.title,
      isFolder: this.isFolder,
      returnFocus: this.element
    });
  }

  async update(data) {
    if (this.destroyed) return;
    const updateVersion = ++this.updateVersion;
    const previousTitle = this.data.title;
    const previousUrl = this.data.url;
    const definedData = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
    this.data = { ...this.data, ...definedData };
    const titleEl = this.element.querySelector('.card-title');
    titleEl.textContent = this.data.title;
    titleEl.title = this.data.title;

    const metaEl = this.element.querySelector('.card-meta');
    if (this.isFolder) {
      if (definedData.childCount !== undefined) {
        this.childCount = definedData.childCount;
      } else {
        const children = await BookmarkStore.getChildren(this.data.id);
        if (this.destroyed || updateVersion !== this.updateVersion) return;
        this.childCount = children.length;
      }
      metaEl.textContent = `${this.childCount} 项`;
    } else {
      metaEl.textContent = this.getDomain(this.data.url);
      if (previousTitle !== this.data.title || previousUrl !== this.data.url) {
        const localIcon = resolveBookmarkIcon(this.data, { storage: BookmarkStore });
        const siteIcon = localIcon ? null : BookmarkStore.getSiteIcon(this.data.url);
        this.siteIconModel = siteIcon;
        this.updateIcon(localIcon || siteIcon);
        if (!localIcon && !siteIcon) this.resolveSiteIconWhenVisible();
      }
    }
  }

  animateCreate() {
    this.element.classList.add('adding');
  }

  // ========== 右键菜单 ==========

  showContextMenu(x, y) {
    if (this.destroyed || this.interactionPaused) return;
    activeMenuOwner?.closeContextMenu();
    document.querySelectorAll('.context-menu').forEach(el => el.remove());

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', `${this.data.title || '书签'}的操作`);
    this.contextMenu = menu;
    activeMenuOwner = this;

    const heading = document.createElement('div');
    heading.className = 'context-menu-title';
    heading.textContent = this.data.title || (this.isFolder ? '文件夹' : '书签');
    heading.title = heading.textContent;
    heading.setAttribute('aria-hidden', 'true');
    menu.appendChild(heading);

    const hasCustomIcon = BookmarkStore.getCustomIcon(this.data.id);
    const canFetchWebsiteIcon = /^https?:\/\//i.test(this.data.url || '');

    const items = [
      {
        label: '重命名…',
        icon: 'bookmark',
        shortcut: 'F2',
        action: () => this.startEdit()
      },
      {
        label: '移动到…',
        icon: 'folder',
        action: () => EventBus.emit('card:move', { id: this.data.id, returnFocus: this.element })
      },
      { type: 'separator' },
      {
        label: hasCustomIcon ? '编辑图标…' : '选择或上传图标…',
        icon: 'grid',
        action: () => EventBus.emit('iconStudio:open', {
          bookmark: this.data,
          returnFocus: this.element
        })
      },
    ];

    if (hasCustomIcon) {
      items.push({
        label: this.isFolder ? '恢复默认文件夹图标' : '恢复默认图标',
        icon: 'grid',
        action: () => this.removeCustomIcon()
      });
    } else if (!this.isFolder) {
      if (this.siteIconModel) {
        items.push({
          label: '调整网站图标…',
          icon: 'grid',
          action: () => EventBus.emit('iconStudio:openSiteBackground', { bookmark: this.data, returnFocus: this.element })
        });
      }
      if (canFetchWebsiteIcon) {
        items.push({
          label: '重新获取网站图标',
          icon: 'grid',
          action: () => this.refreshWebsiteIcon()
        });
      }
    }

    items.push(
      { type: 'separator' },
      {
        label: '删除',
        icon: 'trash',
        className: 'danger',
        action: () => EventBus.emit('card:requestDelete', {
          id: this.data.id,
          isFolder: this.isFolder,
          title: this.data.title,
          returnFocus: this.element
        })
      }
    );

    items.forEach(item => {
      if (item.type === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'context-menu-separator';
        sep.setAttribute('role', 'separator');
        menu.appendChild(sep);
      } else {
        const menuItem = document.createElement('button');
        menuItem.type = 'button';
        menuItem.setAttribute('role', 'menuitem');
        menuItem.className = `context-menu-item ${item.className || ''}`;
        const icon = document.createElement('span');
        icon.innerHTML = iconSvg(item.icon);
        const label = document.createElement('span');
        label.textContent = item.label;
        menuItem.append(icon, label);
        if (item.shortcut) {
          const shortcut = document.createElement('kbd');
          shortcut.className = 'context-menu-shortcut';
          shortcut.textContent = item.shortcut;
          shortcut.setAttribute('aria-hidden', 'true');
          menuItem.appendChild(shortcut);
          menuItem.setAttribute('aria-keyshortcuts', item.shortcut);
        }
        menuItem.addEventListener('click', (e) => {
          e.stopPropagation();
          this.closeContextMenu(true);
          item.action();
        });
        menu.appendChild(menuItem);
      }
    });

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    activateMenu(menu, returnFocus => this.closeContextMenu(returnFocus));
    document.body.appendChild(menu);
    this.contextMenuKeyboardCleanup = bindMenuKeyboard(menu, returnFocus => this.closeContextMenu(returnFocus));

    this.scheduleFrame(() => {
      if (this.contextMenu !== menu) return;
      const rect = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
    });

  }

  closeContextMenu(returnFocus = false) {
    releaseMenu(this.contextMenu);
    if (returnFocus && this.contextMenu && this.element?.isConnected) this.element.focus({ preventScroll: true });
    this.contextMenuKeyboardCleanup?.();
    this.contextMenuKeyboardCleanup = null;
    this.contextMenu?.remove();
    this.contextMenu = null;
    if (activeMenuOwner === this) activeMenuOwner = null;
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
      const iconModel = resolveBookmarkIcon(this.data, { storage: BookmarkStore }) || BookmarkStore.getSiteIcon(this.data.url);
      this.updateIcon(iconModel);
      if (!iconModel) this.resolveSiteIconWhenVisible();
    }
  }

  async refreshWebsiteIcon() {
    const iconEl = this.element.querySelector('.card-icon');
    if (iconEl) iconEl.style.opacity = '0';
    BookmarkStore.clearSiteIcon(this.data.url);
    this.siteIconModel = null;
    const background = BookmarkStore.getSiteIconBackground(this.data.id);
    if (background.mode === 'auto') BookmarkStore.setSiteIconBackground(this.data.id, { mode: 'auto' });
    this.updateIcon(resolveBookmarkIcon(this.data, { storage: BookmarkStore }));
    this.resolveSiteIconWhenVisible();
    if (iconEl) {
      iconEl.style.transition = 'opacity var(--card-motion-duration) var(--card-motion-ease)';
      iconEl.style.opacity = '1';
    }
  }

  /**
   * 更新卡片图标显示
   * @param {object|string|null} iconData - 解析模型 / 原始 SVG 文本 / data URL / null（恢复默认）
   */
  updateIcon(iconData) {
    if (this.destroyed) return;
    const iconEl = this.element.querySelector('.card-icon');
    if (!iconEl) return;

    // 图标工坊保存的是 { kind, data, background } 记录，不是可直接赋给
    // <img src> 的渲染模型。先走解析器，避免浏览器把对象字符串化成
    // "[object Object]"，导致关闭弹窗后出现破图、刷新才恢复。
    if (iconData && typeof iconData === 'object' && !iconData.type && iconData.data) {
      this.updateIcon(resolveBookmarkIcon(this.data, { storage: BookmarkStore }));
      return;
    }

    if (iconData && typeof iconData === 'object' && iconData.type) {
      const displayIcon = iconData.source === 'site'
        ? { ...iconData, background: this.siteBackgroundPreview || BookmarkStore.getSiteIconBackground(this.data.id) }
        : iconData;
      if (iconData.source === 'site') this.siteIconModel = iconData;
      this.setIconAvailable(true);
      if (this.isFolder && iconData.type === 'initial') {
        iconEl.classList.add('folder-default');
        applyDefaultFolderIcon(iconEl);
      } else {
        iconEl.classList.remove('folder-default');
        applyIconModelToElement(iconEl, displayIcon);
        if (iconData.source === 'site' && displayIcon.background?.mode === 'auto' && (!displayIcon.background.result || displayIcon.background.sourceValue !== iconData.value)) {
          void this.resolveAutoSiteBackground(iconData);
        }
      }
      return;
    }

    if (this.isFolder) {
      this.setIconAvailable(true);
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
      const fallbackIcon = iconData || resolveBookmarkIcon(this.data, { storage: BookmarkStore });
      this.setIconAvailable(Boolean(fallbackIcon));
      if (iconData) {
        if (isSvgRaw(iconData)) {
          applySvgToElement(iconEl, iconData);
        } else {
          applyImageToElement(iconEl, iconData);
        }
      } else {
        applyIconModelToElement(iconEl, fallbackIcon);
      }
    }
  }

  async resolveAutoSiteBackground(iconData) {
    const result = await analyzeIconBackground({ kind: iconData.type, value: iconData.value });
    if (!result.ok || this.destroyed || !this.element?.isConnected || this.siteIconModel?.value !== iconData.value) return;
    const background = { mode: 'auto', result: result.result, sourceValue: iconData.value, scale: getIconScale(BookmarkStore.getSiteIconBackground(this.data.id)) };
    BookmarkStore.setSiteIconBackground(this.data.id, background);
    this.updateIcon(iconData);
  }

  animateDelete() {
    if (this.destroyed) return Promise.resolve();
    if (this.deletePromise) return this.deletePromise;
    this.setInteractionPaused(true);
    this.deletePromise = new Promise((resolve) => {
      this.deleteResolve = resolve;
      this.element.classList.add('deleting');
      this.schedule(() => this.destroy(), this.motionDuration('--card-delete-duration', 200));
    });
    return this.deletePromise;
  }

  animateShake() {
    if (this.destroyed) return;
    this.element.classList.add('shake');
    this.schedule(() => {
      this.element.classList.remove('shake');
    }, this.motionDuration('--card-shake-duration', 280));
  }
}

export default BookmarkCard;
