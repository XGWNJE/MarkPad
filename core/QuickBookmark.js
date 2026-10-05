export const QUICK_BOOKMARK_TITLE = 'MarkPad：点击添加当前页面到书签栏';

const FEEDBACK = {
  created: { text: '✓', color: '#222222', title: '已添加到书签栏' },
  exists: { text: '=', color: '#666666', title: '当前页面已是书签，无需重复添加' },
  unsupported: { text: '?', color: '#666666', title: '此页面不支持快速收藏，请在网页或本地文件页面使用' },
  loading: { text: '?', color: '#666666', title: '页面正在跳转，请加载完成后重试' },
  failed: { text: '!', color: '#C43B3B', title: '添加失败，请重试或检查书签栏是否可写' }
};

function findBookmarkBar(tree) {
  const roots = tree[0]?.children || [];
  const writable = node => node.id && !node.url && !node.unmodifiable;
  const bar = roots.find(node => node.folderType === 'bookmarks-bar' && writable(node));
  // Older Chrome versions omit folderType; retain the bookmark tree's root order.
  return bar || (roots.every(node => !node.folderType) ? roots.find(writable) : null);
}

export function createQuickBookmarkAction(api) {
  const pending = new Map();
  const feedbackSessions = new Map();

  async function setFeedback(tabId, state) {
    // A closed tab or failed badge must never turn a successful write into a retry.
    await Promise.allSettled([
      Promise.resolve().then(() => api.action.setBadgeBackgroundColor({ tabId, color: state.color })),
      Promise.resolve().then(() => api.action.setBadgeText({ tabId, text: state.text })),
      Promise.resolve().then(() => api.action.setTitle({ tabId, title: state.title }))
    ]);
  }

  async function save(url, title) {
    const matches = await api.bookmarks.search({ url });
    if (matches.some(node => node.url === url)) return 'exists';
    const bar = findBookmarkBar(await api.bookmarks.getTree());
    if (!bar) throw new Error('No writable bookmark bar');
    await api.bookmarks.create({ parentId: bar.id, title, url });
    return 'created';
  }

  async function handleClick(tab) {
    if (!Number.isInteger(tab?.id) || tab.id < 0) return;
    const tabId = tab.id;
    const session = {};
    feedbackSessions.set(tabId, session);
    let status;
    let url;
    try {
      const parsed = new URL(tab.url);
      if (['http:', 'https:', 'file:'].includes(parsed.protocol)) url = parsed.href;
    } catch {}

    if (!url) {
      status = 'unsupported';
    } else if (tab.pendingUrl && tab.pendingUrl !== tab.url) {
      status = 'loading';
    } else {
      const title = tab.title?.trim() || url;
      try {
        let request = pending.get(url);
        if (!request) {
          request = save(url, title).finally(() => pending.delete(url));
          pending.set(url, request);
        }
        status = await request;
      } catch {
        status = 'failed';
      }
    }

    if (feedbackSessions.get(tabId) === session) {
      const state = FEEDBACK[status];
      await setFeedback(tabId, { ...state, title: `MarkPad：${state.title}` });
    }
    return status;
  }

  async function handleTabUpdated(tabId, changeInfo) {
    if (changeInfo.url === undefined && changeInfo.status !== 'loading') return;
    feedbackSessions.delete(tabId);
    await setFeedback(tabId, { text: '', color: '#222222', title: QUICK_BOOKMARK_TITLE });
  }

  function handleTabRemoved(tabId) {
    feedbackSessions.delete(tabId);
  }

  return { handleClick, handleTabUpdated, handleTabRemoved };
}
