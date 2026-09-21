/**
 * BookmarkStore - 数据层：封装 chrome.bookmarks API + 事件监听
 */
import EventBus from './EventBus.js';
import { resolveSiteIcon as resolveSiteIconResource } from './icons/SiteIconResolver.js';
import { normalizeIconBackground } from './icons/IconBackground.js';

const CUSTOM_ICON_STORAGE_KEY = 'custom_icon_cache';
// v2 从卡片挂载后才开始读取网站资源；不复用 v1 的失败记录，保证更新后立即重试。
const SITE_ICON_STORAGE_KEY = 'site_icon_cache_v2';
const SITE_ICON_BACKGROUND_STORAGE_KEY = 'site_icon_background_cache_v1';
const SITE_ICON_SUCCESS_TTL = 30 * 24 * 60 * 60 * 1000;
const SITE_ICON_FAILURE_TTL = 24 * 60 * 60 * 1000;

class BookmarkStore {
  constructor() {
    // 缓存
    this.cache = new Map();
    this.tree = null;

    // 网站声明图标缓存：按完整书签 URL 缓存，避免同域页面串图标。
    this.siteIcons = null;
    this.siteIconStorageKey = SITE_ICON_STORAGE_KEY;
    // 网站图标的显示背景按书签保存，不会把网站图标转换为自定义图标。
    this.siteIconBackgrounds = null;
    this.siteIconBackgroundStorageKey = SITE_ICON_BACKGROUND_STORAGE_KEY;
    // 用户自定义图标缓存
    this.customIconStorageKey = CUSTOM_ICON_STORAGE_KEY;
    this.customIcons = null; // 延迟加载
    this.storageInitialized = false;
    this.siteIconPending = new Map();

    // 监听 Chrome 书签变更
    this.setupListeners();
  }

  async initStorage() {
    if (this.storageInitialized) return;
    this.siteIcons = await this._loadMapFromStorage(this.siteIconStorageKey);
    this.siteIconBackgrounds = await this._loadMapFromStorage(this.siteIconBackgroundStorageKey);
    this.customIcons = await this._loadMapFromStorage(this.customIconStorageKey);
    this.storageInitialized = true;
  }

  async _loadMapFromStorage(key) {
    const localValue = this._readLocalStorageObject(key);
    let storedValue = null;

    try {
      const result = await chrome.storage.local.get(key);
      storedValue = result?.[key] || null;
    } catch {}

    const merged = { ...(localValue || {}), ...(storedValue || {}) };
    const map = new Map(Object.entries(merged));

    if (localValue && !storedValue) {
      this._writeChromeStorageObject(key, merged);
    }

    return map;
  }

  _readLocalStorageObject(key) {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : null;
    } catch {
      localStorage.removeItem(key);
      return null;
    }
  }

  _writeChromeStorageObject(key, value) {
    try {
      const result = chrome.storage.local.set({ [key]: value });
      if (result?.catch) {
        result.catch(() => {});
      }
    } catch {}
  }

  setupListeners() {
    chrome.bookmarks.onCreated.addListener((_id, bookmark) => {
      this.invalidateCache();
      EventBus.emit('created', bookmark);
    });

    chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
      this.invalidateCache();
      EventBus.emit('removed', { id, ...removeInfo });
    });

    chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
      this.invalidateCache();
      EventBus.emit('changed', { id, ...changeInfo });
    });

    chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
      this.invalidateCache();
      EventBus.emit('moved', { id, ...moveInfo });
    });

    chrome.bookmarks.onChildrenReordered.addListener((id, reorderInfo) => {
      this.invalidateCache();
      EventBus.emit('childrenReordered', { id, ...reorderInfo });
    });
  }

  invalidateCache() {
    this.cache.clear();
    this.tree = null;
  }

  // ========== 书签树操作 ==========

  /**
   * 获取书签树
   */
  async getTree() {
    if (!this.tree) {
      this.tree = await chrome.bookmarks.getTree();
    }
    return this.tree;
  }

  /**
   * 获取节点
   * @param {string} nodeId - 节点 ID
   */
  async getNode(nodeId) {
    const tree = await this.getTree();
    return this.findNode(tree, nodeId);
  }

  findNode(nodes, id) {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = this.findNode(node.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * 获取根文件夹 ID（书签栏 / 其他书签）
   * Chrome 账号书签模式下永久文件夹 ID 不再固定为 1/2/3，必须从树动态解析
   */
  async getRootFolderIds() {
    const tree = await this.getTree();
    const roots = tree[0]?.children || [];
    return {
      bookmarkBar: roots[0]?.id || '1',
      other: roots[1]?.id || null
    };
  }

  /**
   * 获取子项
   * @param {string} parentId - 父节点 ID
   */
  async getChildren(parentId) {
    const cacheKey = `children:${parentId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const children = await chrome.bookmarks.getChildren(parentId);
      // 保持 Chrome API 返回的原始 index 顺序，不重排
      this.cache.set(cacheKey, children);
      return children;
    } catch (err) {
      console.error('Failed to get children:', err);
      return [];
    }
  }

  async getFolderChildCountMap() {
    const tree = await this.getTree();
    const counts = new Map();

    const walk = (node) => {
      if (!node?.children) return;
      counts.set(node.id, node.children.length);
      node.children.forEach(walk);
    };

    tree.forEach(walk);
    return counts;
  }

  /**
   * 全局搜索
   * @param {string} query - 搜索词
   */
  async search(query) {
    if (!query) return [];
    try {
      return await chrome.bookmarks.search(query);
    } catch (err) {
      console.error('Search failed:', err);
      return [];
    }
  }

  // ========== 自定义图标系统 ==========

  /**
   * 初始化自定义图标缓存
   */
  _loadCustomIcons() {
    if (this.customIcons !== null) return;
    this.customIcons = new Map();
    const stored = this._readLocalStorageObject(this.customIconStorageKey);
    if (stored) {
      for (const [key, value] of Object.entries(stored)) {
        this.customIcons.set(key, value);
      }
    }
  }

  /**
   * 设置书签自定义图标
   * @param {string} bookmarkId - 书签 ID
   * @param {string|object} iconData - 原始 SVG/图片，或包含纯色背景的图标记录
   */
  setCustomIcon(bookmarkId, iconData) {
    this._loadCustomIcons();
    this.customIcons.set(bookmarkId, iconData);
    const obj = Object.fromEntries(this.customIcons);
    this._writeChromeStorageObject(this.customIconStorageKey, obj);
    try {
      localStorage.setItem(this.customIconStorageKey, JSON.stringify(obj));
    } catch {}
  }

  /**
   * 移除书签自定义图标
   * @param {string} bookmarkId - 书签 ID
   */
  removeCustomIcon(bookmarkId) {
    this._loadCustomIcons();
    this.customIcons.delete(bookmarkId);
    const obj = Object.fromEntries(this.customIcons);
    this._writeChromeStorageObject(this.customIconStorageKey, obj);
    try {
      localStorage.setItem(this.customIconStorageKey, JSON.stringify(obj));
    } catch {}
  }

  /**
   * 获取书签自定义图标
   * @param {string} bookmarkId - 书签 ID
   * @returns {string|null} data URL 或 null
   */
  getCustomIcon(bookmarkId) {
    this._loadCustomIcons();
    return this.customIcons.get(bookmarkId) || null;
  }

  // ========== 网站声明图标缓存 ==========

  getSiteIconCacheKey(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      parsed.hash = '';
      return parsed.href;
    } catch {
      return null;
    }
  }

  _loadSiteIcons() {
    if (this.siteIcons !== null) return;
    this.siteIcons = new Map(Object.entries(this._readLocalStorageObject(this.siteIconStorageKey) || {}));
  }

  _saveSiteIcons() {
    const value = Object.fromEntries(this.siteIcons);
    this._writeChromeStorageObject(this.siteIconStorageKey, value);
    try {
      localStorage.setItem(this.siteIconStorageKey, JSON.stringify(value));
    } catch {}
  }

  getSiteIconEntry(url) {
    const key = this.getSiteIconCacheKey(url);
    if (!key) return null;
    this._loadSiteIcons();
    const entry = this.siteIcons.get(key);
    if (!entry || Date.now() - entry.checkedAt > (entry.model ? SITE_ICON_SUCCESS_TTL : SITE_ICON_FAILURE_TTL)) {
      return null;
    }
    return entry;
  }

  getSiteIcon(url) {
    return this.getSiteIconEntry(url)?.model || null;
  }

  _loadSiteIconBackgrounds() {
    if (this.siteIconBackgrounds !== null) return;
    this.siteIconBackgrounds = new Map(Object.entries(this._readLocalStorageObject(this.siteIconBackgroundStorageKey) || {}));
  }

  _saveSiteIconBackgrounds() {
    const value = Object.fromEntries(this.siteIconBackgrounds);
    this._writeChromeStorageObject(this.siteIconBackgroundStorageKey, value);
    try {
      localStorage.setItem(this.siteIconBackgroundStorageKey, JSON.stringify(value));
    } catch {}
  }

  getSiteIconBackground(bookmarkId) {
    if (!bookmarkId) return { mode: 'raw' };
    this._loadSiteIconBackgrounds();
    return normalizeIconBackground(this.siteIconBackgrounds.get(bookmarkId));
  }

  setSiteIconBackground(bookmarkId, background) {
    if (!bookmarkId) return;
    this._loadSiteIconBackgrounds();
    const normalized = normalizeIconBackground(background);
    if (normalized.mode === 'raw') {
      this.siteIconBackgrounds.delete(bookmarkId);
    } else {
      this.siteIconBackgrounds.set(bookmarkId, normalized);
    }
    this._saveSiteIconBackgrounds();
  }

  clearSiteIcon(url) {
    const key = this.getSiteIconCacheKey(url);
    if (!key) return;
    this._loadSiteIcons();
    this.siteIcons.delete(key);
    this._saveSiteIcons();
  }

  async resolveSiteIcon(url) {
    const key = this.getSiteIconCacheKey(url);
    if (!key) return null;
    const cached = this.getSiteIconEntry(key);
    if (cached) return cached.model || null;
    if (this.siteIconPending.has(key)) return await this.siteIconPending.get(key);

    const request = resolveSiteIconResource(key).then(model => {
      this._loadSiteIcons();
      this.siteIcons.set(key, { model, checkedAt: Date.now() });
      this._saveSiteIcons();
      return model;
    }).finally(() => {
      this.siteIconPending.delete(key);
    });
    this.siteIconPending.set(key, request);
    return await request;
  }

  /**
   * 新建书签或文件夹
   * @param {string} parentId - 父节点 ID
   * @param {string} title - 标题
   * @param {string} [url] - 网址（无则为文件夹）
   */
  async create(parentId, title, url) {
    try {
      const bookmark = await chrome.bookmarks.create({
        parentId,
        title,
        ...(url && { url })
      });
      this.invalidateCache();
      return bookmark;
    } catch (err) {
      console.error('Create failed:', err);
      throw err;
    }
  }

  /**
   * 更新书签/文件夹
   * @param {string} id - 节点 ID
   * @param {string} title - 新标题
   * @param {string} [url] - 新网址
   */
  async update(id, title, url) {
    try {
      const updateInfo = { title };
      if (url !== undefined) updateInfo.url = url;
      const bookmark = await chrome.bookmarks.update(id, updateInfo);
      this.invalidateCache();
      return bookmark;
    } catch (err) {
      console.error('Update failed:', err);
      throw err;
    }
  }

  /**
   * 移动书签/文件夹
   * @param {string} id - 节点 ID
   * @param {string} parentId - 新父节点 ID
   * @param {number} [index] - 新位置
   */
  async move(id, parentId, index) {
    try {
      const moveInfo = { parentId };
      if (index !== undefined) moveInfo.index = index;
      const bookmark = await chrome.bookmarks.move(id, moveInfo);
      this.invalidateCache();
      return bookmark;
    } catch (err) {
      console.error('Move failed:', err);
      throw err;
    }
  }

  /**
   * 删除书签
   * @param {string} id - 节点 ID
   * @param {boolean} isFolder - 是否为文件夹
   */
  async remove(id, isFolder) {
    try {
      if (isFolder) {
        await chrome.bookmarks.removeTree(id);
      } else {
        await chrome.bookmarks.remove(id);
      }
      this.invalidateCache();
    } catch (err) {
      console.error('Remove failed:', err);
      throw err;
    }
  }

  /**
   * 获取文件夹树（用于移动对话框）
   * @param {string} excludeId - 排除的节点 ID（不能移动到自身或子节点）
   */
  async getFolderTree(excludeId = null) {
    const tree = await this.getTree();
    const { other: otherBookmarksId } = await this.getRootFolderIds();
    const result = [];

    const processNode = (node, path = '') => {
      if (node.id === '0') {
        // 根节点，遍历子节点
        if (node.children) {
          node.children.forEach(child => {
            const item = processNode(child, path);
            if (item) result.push(item);
          });
        }
        return null;
      }

      if (otherBookmarksId && node.id === otherBookmarksId) {
        // 保持现有行为：移动目标不包含"其他书签"
        return null;
      }

      if (!node.url) {
        if (excludeId && node.id === excludeId) {
          return null;
        }

        const currentPath = path ? `${path} / ${node.title}` : node.title;
        const item = {
          id: node.id,
          title: node.title,
          path: currentPath,
          children: []
        };

        if (node.children) {
          node.children.forEach(child => {
            if (!child.url) {
              const childItem = processNode(child, currentPath);
              if (childItem) item.children.push(childItem);
            }
          });
        }

        return item;
      }

      return null;
    };

    processNode(tree[0], '');
    return result;
  }

  isDescendant(parent, childId) {
    if (!parent.children) return false;
    for (const child of parent.children) {
      if (child.id === childId) return true;
      if (!child.url && this.isDescendant(child, childId)) return true;
    }
    return false;
  }

  countDescendants(node) {
    if (!node?.children) return 0;
    let count = node.children.length;
    for (const child of node.children) {
      count += this.countDescendants(child);
    }
    return count;
  }
}

export default new BookmarkStore();
