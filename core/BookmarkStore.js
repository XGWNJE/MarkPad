/**
 * BookmarkStore - 数据层：封装 chrome.bookmarks API + 事件监听
 */
import EventBus from './EventBus.js';
import { resolveSiteIcon as resolveSiteIconResource } from './icons/SiteIconResolver.js';
import { normalizeIconBackground } from './icons/IconBackground.js';

const CUSTOM_ICON_STORAGE_KEY = 'custom_icon_cache';
// v3 把网站图标的字节直接存成本地 data URL；v2 只存第三方 URL，每次渲染都要重新联网。
const SITE_ICON_STORAGE_KEY = 'site_icon_cache_v3';
const LEGACY_SITE_ICON_STORAGE_KEYS = ['site_icon_cache_v2'];
const SITE_ICON_BACKGROUND_STORAGE_KEY = 'site_icon_background_cache_v1';
// 取不到图标时按失败原因退避重试：网络抖动只影响很短时间，站点图标本身不可用才拉长间隔。
const SITE_ICON_RETRY_DELAYS = { unreachable: 2 * 60 * 1000, unusable: 6 * 60 * 60 * 1000 };
const SITE_ICON_RETRY_MAX_DELAY = 24 * 60 * 60 * 1000;
// 序列化后允许占用的字符上限，超出后淘汰最久未校验的条目。
const SITE_ICON_CACHE_MAX_CHARS = 2_000_000;
// 一批图标同时解析时合并写入，避免整份缓存被反复序列化和同步写入 localStorage。
const SITE_ICON_SAVE_DELAY = 300;

class BookmarkStore {
  constructor() {
    // 缓存
    this.cache = new Map();
    this.tree = null;
    this.cacheGeneration = 0;

    // 网站声明图标缓存：按完整书签 URL 缓存本地字节，避免同域页面串图标。
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
    this.siteIconSaveTimer = null;
    this.flushSiteIconsOnHide();

    // 监听 Chrome 书签变更
    this.setupListeners();
  }

  async initStorage() {
    if (this.storageInitialized) return;
    await this._dropLegacySiteIcons();
    this.siteIcons = await this._loadMapFromStorage(this.siteIconStorageKey);
    this.siteIconBackgrounds = await this._loadMapFromStorage(this.siteIconBackgroundStorageKey);
    this.customIcons = await this._loadMapFromStorage(this.customIconStorageKey);
    this.storageInitialized = true;
  }

  /** v2 只保存远程 URL，无法离线显示；升级时清除，由可见卡片重新解析一次。 */
  async _dropLegacySiteIcons() {
    let stored = {};
    try {
      stored = await chrome.storage.local.get(LEGACY_SITE_ICON_STORAGE_KEYS);
    } catch (error) {
      console.warn('[MarkPad] 读取旧图标缓存失败', error);
    }
    for (const key of LEGACY_SITE_ICON_STORAGE_KEYS) {
      let present = Boolean(stored?.[key]);
      if (!present) {
        try {
          present = localStorage.getItem(key) !== null;
        } catch (error) {
          console.warn(`[MarkPad] 读取旧图标缓存 ${key} 失败`, error);
        }
      }
      if (!present) continue;
      try {
        await chrome.storage.local.remove(key);
      } catch (error) {
        console.warn(`[MarkPad] 清理旧图标缓存 ${key} 失败`, error);
      }
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.warn(`[MarkPad] 清理旧图标缓存 ${key} 失败`, error);
      }
    }
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
        result.catch(error => console.warn(`[MarkPad] ${key} 写入 chrome.storage.local 失败`, error));
      }
    } catch (error) {
      console.warn(`[MarkPad] ${key} 写入 chrome.storage.local 失败`, error);
    }
  }

  _writeLocalStorageObject(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`[MarkPad] ${key} 写入 localStorage 失败`, error);
    }
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
    this.cacheGeneration++;
    this.cache.clear();
    this.tree = null;
  }

  // ========== 书签树操作 ==========

  /**
   * 获取书签树
   */
  async getTree() {
    if (!this.tree) {
      const generation = this.cacheGeneration;
      const tree = await chrome.bookmarks.getTree();
      if (generation !== this.cacheGeneration) return this.getTree();
      this.tree = tree;
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
      const generation = this.cacheGeneration;
      const children = await chrome.bookmarks.getChildren(parentId);
      if (generation !== this.cacheGeneration) return this.getChildren(parentId);
      // 保持 Chrome API 返回的原始 index 顺序，不重排
      this.cache.set(cacheKey, children);
      return children;
    } catch (err) {
      console.error('Failed to get children:', err);
      throw err;
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
    this._writeLocalStorageObject(this.customIconStorageKey, obj);
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
    this._writeLocalStorageObject(this.customIconStorageKey, obj);
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

  /** 页面隐藏或卸载时立即落盘，合并写入不会因为离开新标签页而丢失。 */
  flushSiteIconsOnHide() {
    const flush = () => this._flushSiteIcons();
    try {
      globalThis.addEventListener?.('pagehide', flush);
      globalThis.document?.addEventListener?.('visibilitychange', () => {
        if (globalThis.document.visibilityState === 'hidden') flush();
      });
    } catch (error) {
      console.warn('[MarkPad] 注册图标缓存落盘失败', error);
    }
  }

  _saveSiteIcons() {
    if (this.siteIconSaveTimer !== null) return;
    this.siteIconSaveTimer = setTimeout(() => this._flushSiteIcons(), SITE_ICON_SAVE_DELAY);
  }

  _flushSiteIcons() {
    if (this.siteIconSaveTimer !== null) {
      clearTimeout(this.siteIconSaveTimer);
      this.siteIconSaveTimer = null;
    }
    // 初始化完成前没有可写内容，页面提前卸载也不能抛错。
    if (this.siteIcons === null) return;
    this._evictSiteIcons();
    const value = Object.fromEntries(this.siteIcons);
    this._writeChromeStorageObject(this.siteIconStorageKey, value);
    this._writeLocalStorageObject(this.siteIconStorageKey, value);
  }

  /** 控制缓存体积：超过上限时按最久未校验优先淘汰。 */
  _evictSiteIcons() {
    const entries = [...this.siteIcons.entries()].map(([key, entry]) => ({
      key,
      checkedAt: entry?.checkedAt || 0,
      size: JSON.stringify(entry || null).length + key.length + 4
    }));
    let total = entries.reduce((sum, entry) => sum + entry.size, 0);
    if (total <= SITE_ICON_CACHE_MAX_CHARS) return;
    entries.sort((a, b) => a.checkedAt - b.checkedAt);
    for (const entry of entries) {
      this.siteIcons.delete(entry.key);
      total -= entry.size;
      if (total <= SITE_ICON_CACHE_MAX_CHARS) return;
    }
  }

  getSiteIconEntry(url) {
    const key = this.getSiteIconCacheKey(url);
    if (!key) return null;
    this._loadSiteIcons();
    const entry = this.siteIcons.get(key);
    if (!entry) return null;
    // 已保存本地字节的条目永久命中，不再请求网站。失败条目只在退避期内命中，
    // 退避到期后返回 null，让卡片自动重新解析一次。
    if (entry.model) return entry;
    return (entry.retryAt || 0) > Date.now() ? entry : null;
  }

  getSiteIcon(url) {
    return this.getSiteIconEntry(url)?.model || null;
  }

  _createSiteIconEntry(key, result) {
    const checkedAt = Date.now();
    if (result?.model) return { model: result.model, checkedAt };

    const previous = this.siteIcons.get(key);
    const failure = result?.failure === 'unusable' ? 'unusable' : 'unreachable';
    const attempts = (Number(previous?.attempts) || 0) + 1;
    const baseDelay = SITE_ICON_RETRY_DELAYS[failure] || SITE_ICON_RETRY_DELAYS.unreachable;
    return {
      model: null,
      failure,
      attempts,
      checkedAt,
      retryAt: checkedAt + Math.min(baseDelay * 2 ** (attempts - 1), SITE_ICON_RETRY_MAX_DELAY)
    };
  }

  _loadSiteIconBackgrounds() {
    if (this.siteIconBackgrounds !== null) return;
    this.siteIconBackgrounds = new Map(Object.entries(this._readLocalStorageObject(this.siteIconBackgroundStorageKey) || {}));
  }

  _saveSiteIconBackgrounds() {
    const value = Object.fromEntries(this.siteIconBackgrounds);
    this._writeChromeStorageObject(this.siteIconBackgroundStorageKey, value);
    this._writeLocalStorageObject(this.siteIconBackgroundStorageKey, value);
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
    if (normalized.mode === 'raw' && normalized.scale === undefined) {
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

    const request = resolveSiteIconResource(key).then(result => {
      this._loadSiteIcons();
      const entry = this._createSiteIconEntry(key, result);
      this.siteIcons.set(key, entry);
      this._saveSiteIcons();
      return entry.model || null;
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
