# 浏览器兼容性

核对日期：2026-10-22。Ego Lite 已进行真实扩展实测，其余浏览器依据当前源码与官方文档判断。“预计兼容”是接口层面的推断，不是完整功能验收；以下结论仅针对桌面版。

| 浏览器 | 当前结论 | 要求与限制 |
| --- | --- | --- |
| **Ego Lite（Windows，Chromium 154）** | **主要功能实测通过** | 原生接口与主要功能以 MarkPad `0.5.1` 实测，鼠标拖拽由用户确认通过；当前 UI 使用测试数据检查。见[实测范围](#ego-lite-实测)。 |
| **Google Chrome** | **主要支持目标** | 当前包使用 Chrome 的 Manifest V3、后台模块与原生书签 API，通过[新标签页覆盖接口](https://developer.chrome.com/docs/extensions/develop/ui/override-chrome-pages)显示面板。 |
| **Microsoft Edge（Chromium）** | 预计兼容，未实测 | [官方说明](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension)确认与 Chrome 扩展接口基本兼容；[接口清单](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/api-support)包含本项目使用的 `bookmarks`、`storage`、`tabs`、`runtime`、`action`。 |
| **Brave** | 预计兼容，未实测 | [官方说明](https://support.brave.app/hc/en-us/articles/360017909112-How-can-I-add-extensions-to-Brave)支持绝大多数 Chromium 扩展；仍需确认 MarkPad 的新标签页接管与书签操作。 |
| **Vivaldi** | 预计兼容，需设置，未实测 | 支持 Chrome 扩展；须在「设置 → 标签页 → 新标签页」勾选「由扩展控制」。见[官方扩展说明](https://help.vivaldi.com/desktop/appearance-customization/extensions/)。 |
| **Opera** | 当前包不兼容 | [MDN 兼容数据](https://github.com/mdn/browser-compat-data/blob/main/webextensions/manifest/chrome_url_overrides.json)将 `chrome_url_overrides.newtab` 标为不支持，当前清单无法按既定方式接管新标签页。 |
| **Firefox（含 ESR）** | 当前包不兼容 | [后台配置文档](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background#browser_support)说明不支持 `background.service_worker`；当前包没有 Firefox 后台入口，需适配后台与 API 调用。 |
| **Safari** | 当前包不兼容 | [书签 API 兼容数据](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/bookmarks.json)显示不支持必需的 `bookmarks` API；此外还需按 [Apple 说明](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)单独打包，不能仅靠转换包解决书签访问。 |
| **其他 Chromium 浏览器** | 未确认 | 同内核不等于扩展接口完全一致；需同时确认 Manifest V3 后台模块、原生书签 API 和新标签页覆盖功能。 |

## Ego Lite 实测

使用已解压的真实扩展与原生 Chrome API；所有书签写操作限于本轮临时测试文件夹。

| 项目 | 结果 |
| --- | --- |
| 加载与新标签页 | 通过：重新加载当前仓库扩展，新标签页实际进入 MarkPad。 |
| 书签读写 | 通过：读取、新建书签与文件夹、F2 重命名、确认删除；通过实际数据层 API 移入子文件夹再移回，并刷新卡片。 |
| 主题与图标 | 通过：浅深主题、软陶 PNG 与扁平 SVG；图标工坊搜索、预览、应用和恢复默认。浅深界面与工坊均检查了实际截图。 |
| 存储与后台 | 通过：`chrome.storage.local` 写入、读取和删除；后台模块接收消息，并从本机 HTTP 测试服务发现、下载图标。 |
| 后台新标签页打开 | 通过：点击测试卡片创建后台标签页，核对 `active: false`，随后关闭测试标签页。 |
| 鼠标拖拽 | 通过：用户确认实际拖拽正常。 |
| UI 图标与拖拽侧栏 | 测试数据检查通过：浅深主题、各菜单与弹窗、16–32px 图标、长目录滚动及窗口边界；删除区外与圆角外投放不触发确认，区内投放仍先确认。 |

Ego 的部分自动化输入会触发页面隐藏，使菜单按现有逻辑关闭；设置切换已用同页原生输入复核通过。未覆盖触摸／手写笔、工具栏按钮实际点击与上传文件，不将这些项目记为通过。

测试目录、测试标签页及存储读写测试用键已清理，主题、图标风格和打开偏好已恢复；测试前后核对原有书签内容及顺序不变。

当前 `0.6.0` 界面已用 Ego 公开测试数据验证创建与重试、重命名、批量排序／删除、设置、图标应用／恢复和帮助入口；独立 Chrome 检查了浅深主题、窄窗与短窗口。此结果不代替新版在已安装扩展中的原生 API、硬件触控或手写笔验收。

## 使用边界

- 推荐使用最新稳定版。清单没有设置 `minimum_chrome_version`，也未实测最低版本，不能据此承诺旧版兼容；不支持 `corner-shape` 时卡片回退为普通圆角，`color-mix()` 等样式仍要求现代浏览器。
- Chrome 的无痕窗口不能由扩展替换新标签页，见[官方说明](https://developer.chrome.com/docs/extensions/develop/ui/override-chrome-pages#incognito_window_behavior)。其他新标签页扩展或组织策略也可能影响接管结果。
- 表中结论不延伸到 Android、iOS 或 iPadOS；桌面触屏操作支持不代表手机版浏览器已经适配。

## 核对依据

- [manifest.json](../manifest.json)：Manifest V3、`chrome_url_overrides.newtab`、`background.service_worker` 与模块配置。
- [书签存储](../core/BookmarkStore.js)、[工具栏收藏](../core/QuickBookmark.js)、[后台入口](../background.js)：书签、存储、标签页和消息接口；当前没有独立的 Firefox 或 Safari 适配层。
- [卡片样式](../css/modules/card.css)：连续圆角的特性检测与普通圆角回退。Node 行为测试用于回归逻辑，不替代各浏览器的安装与运行验证。
