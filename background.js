import { discoverSiteIcons } from './core/icons/SiteIconDiscovery.js';
import { createQuickBookmarkAction } from './core/QuickBookmark.js';

export function createSiteIconMessageHandler(runtime, discover = discoverSiteIcons) {
  return (message, sender, sendResponse) => {
    if (message?.type !== 'site-icons:discover') return false;
    // Only our packaged new-tab document can request discovery, never content scripts.
    let senderUrl;
    try {
      senderUrl = new URL(sender?.url);
    } catch {
      return false;
    }
    if (sender?.id !== runtime.id ||
        `${senderUrl.protocol}//${senderUrl.host}${senderUrl.pathname}` !== runtime.getURL('index.html')) return false;
    let pageUrl;
    try {
      pageUrl = new URL(message.url);
      if (!['https:', 'http:'].includes(pageUrl.protocol)) throw new Error('Invalid protocol');
    } catch {
      sendResponse({ ok: false, error: 'Invalid website icon URL' });
      return false;
    }
    Promise.resolve().then(() => discover(pageUrl.href)).then(
      candidates => sendResponse({ ok: true, candidates }),
      () => sendResponse({ ok: false, error: 'Website icon discovery failed' })
    );
    return true;
  };
}

chrome.runtime.onMessage.addListener(createSiteIconMessageHandler(chrome.runtime));

const quickBookmark = createQuickBookmarkAction(chrome);
chrome.action.onClicked.addListener(quickBookmark.handleClick);
chrome.tabs.onUpdated.addListener(quickBookmark.handleTabUpdated);
chrome.tabs.onRemoved.addListener(quickBookmark.handleTabRemoved);
