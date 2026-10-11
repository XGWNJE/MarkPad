import { discoverSiteIcons, fetchSiteIconData } from './core/icons/SiteIconDiscovery.js';
import { createQuickBookmarkAction } from './core/QuickBookmark.js';

/** Only our packaged new-tab document may talk to the website-icon endpoints. */
function isOwnNewTab(runtime, sender) {
  let senderUrl;
  try {
    senderUrl = new URL(sender?.url);
  } catch {
    return false;
  }
  return sender?.id === runtime.id
    && `${senderUrl.protocol}//${senderUrl.host}${senderUrl.pathname}` === runtime.getURL('index.html');
}

function httpUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function createSiteIconMessageHandler(runtime, discover = discoverSiteIcons, fetchIcon = fetchSiteIconData) {
  return (message, sender, sendResponse) => {
    const isDiscovery = message?.type === 'site-icons:discover';
    if (!isDiscovery && message?.type !== 'site-icons:fetch') return false;
    if (!isOwnNewTab(runtime, sender)) return false;
    const targetUrl = httpUrl(message.url);
    if (!targetUrl) {
      sendResponse({ ok: false, error: 'Invalid website icon URL' });
      return false;
    }
    const task = isDiscovery
      ? discover(targetUrl).then(result => ({ ok: true, candidates: result.candidates, reachable: result.reachable }))
      : fetchIcon(targetUrl).then(icon => ({ ok: true, ...icon }));
    Promise.resolve().then(() => task).then(
      sendResponse,
      () => sendResponse({ ok: false, error: isDiscovery ? 'Website icon discovery failed' : 'Website icon download failed' })
    );
    return true;
  };
}

chrome.runtime.onMessage.addListener(createSiteIconMessageHandler(chrome.runtime));

const quickBookmark = createQuickBookmarkAction(chrome);
chrome.action.onClicked.addListener(quickBookmark.handleClick);
chrome.tabs.onUpdated.addListener(quickBookmark.handleTabUpdated);
chrome.tabs.onRemoved.addListener(quickBookmark.handleTabRemoved);
