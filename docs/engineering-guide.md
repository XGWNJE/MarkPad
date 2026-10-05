# MarkPad 工程指南

本文描述当前代码职责、数据边界与验证方法。用户操作见 [README](../README.md)，协作入口见 [AGENTS.md](../AGENTS.md)。

## 文件职责

| 位置 | 职责 |
| --- | --- |
| `manifest.json` | 名称、安装版本、权限、新标签页与后台入口 |
| `index.html` / `main.js` / `theme-init.js` | 页面结构、组件装配与全局交互、首次绘制前的主题初始化 |
| `core/BookmarkStore.js` | Chrome 书签读写、树与子项查询、图标数据和缓存 |
| `core/QuickBookmark.js` / `background.js` | Chrome 工具栏点击收藏、按地址去重与标签页结果反馈 |
| `core/Router.js` / `core/EventBus.js` | 文件夹导航与浏览器历史、组件间事件通信 |
| `core/IconLibrary.js` | 应用 UI 的线性 SVG 图标，包括默认文件夹图标 |
| `core/icons/` / `background.js` | 书签图标解析、上传处理、安全清理及网站声明抓取 |
| `components/BookmarkGrid.js` / `BookmarkCard.js` | 卡片网格、新建入口、选择、排序及单卡片交互 |
| `components/GridDragController.js` / `core/DragOrder.js` | 原生拖拽会话、固定插槽命中、让位动画及 Chrome 插入索引 |
| `core/DropTargetGeometry.js` | 拖拽侧栏当前可见矩形与圆角命中 |
| `core/MenuInteraction.js` | 设置弹层可见性与卡片菜单键盘焦点 |
| `components/Breadcrumb.js` / `EditDialog.js` / `MoveDialog.js` | 面包屑、新建与编辑弹窗、移动目标选择 |
| `components/IconStudio.js` / `SettingsPanel.js` | 图标工坊、主题与外观偏好 |
| `components/CardEffects.js` | 卡片指针动画与句柄清理 |
| `components/CardNavigation.js` | 网页直接打开、重复操作防护与文件夹动效清理 |
| `css/` / `icons/` / `assets/` | 样式、应用图标、展示资源；样式分工见[视觉规范](markpad-brand-visual-guide.md#样式维护) |
| `vendor/` / `scripts/vendor-gsap.mjs` | 内置 GSAP 及其生成脚本 |
| `tests/` / `docs/` | Node 行为测试与当前专题文档 |

## 书签与事件

- `BookmarkStore` 封装 `chrome.bookmarks`；根文件夹 ID 通过 `getRootFolderIds()` 动态解析。书签修改直接作用于 Chrome 数据。
- 工具栏快速收藏由后台顶层同步注册的 `chrome.action.onClicked` 触发，不设置 popup。使用点击事件携带的标题与完整 URL，支持 HTTP(S) 和本地文件页面，跳转中的页面提示等待；不查询或切换其他标签页。
- `QuickBookmark` 使用实时书签树中第一个可写的 `bookmarks-bar` 根文件夹，旧版 Chrome 缺少 `folderType` 时按根目录顺序兼容，不猜固定 ID。完整 URL（包括查询与片段）在所有目录中查重，并按 URL 合并并发写入；已有书签只提示，不修改名称或位置。
- 收藏结果以当前标签页的徽标与悬停标题显示：`✓` 已添加、`=` 已存在、`!` 失败、`?` 不支持或正在跳转。导航清除结果，迟到完成不覆盖新页面；提示失败不重试书签写入。后台快速收藏直接调用 `chrome.bookmarks`，页面通过既有书签事件更新网格。
- 组件业务动作通过 `EventBus` 通信。新建卡片和快捷键发出 `toolbar:newBookmark` / `toolbar:newFolder`，`EditDialog` 在当前文件夹创建；网格监听 `navigate` 更新内容。
- 删除通过 `card:requestDelete` 进入 `main.js` 确认弹窗，确认后发出 `card:delete` 执行；文件夹必须展示子项数量。
- 删除确认等待读取完成再开放提交，读取失败可重试；移动弹窗标注并禁用当前父目录，避免同目录移动隐式改变顺序。
- 名称保存和移动提交期间禁用重复确认，状态与错误显示在弹窗固定底部；失败保留当前输入或目标，可直接重试。
- 网格末尾保留新建书签与新建文件夹两张操作卡片。它们不参与书签选择、排序和删除。
- 排序使用 Chrome 移除源节点前的插槽索引，不自行二次补偿。原地移动不写入；正在保存的移动只关联自身事件，API 完成后核对实际顺序与文件夹数量。
- 网格按书签 ID 复用卡片，移除时调用 `destroy()`；导航只提交最后一次请求。书签事件使旧读取缓存失效，读取失败保留当前卡片并提示重试。
- `BookmarkCard` 先同步解析自定义和内置图标，再在挂载且可见后解析网站图标。完整显示规则见[图标来源](touch-icon-guide.md#图标来源)。

## 网站图标与缓存

- `SiteIconResolver.js` 向后台请求候选并验证图片。`background.js` 仅接受本扩展 `index.html` 发出的 HTTP(S) 请求，调用 `SiteIconDiscovery.js` 抓取网页与 Manifest，每个文档请求最多等待 8 秒，只返回图标候选。
- 网页和 Manifest 只在后台抓取，避免响应头预加载信息进入新标签页；不得为消除日志放宽扩展安全策略。
- 网站图标按完整书签 URL 永久缓存，包括网站网络失败或无图标结果。重新获取仅由用户的卡片菜单操作触发；页面加载、扩展刷新、浏览器重启和计时过期均不得触发更新。
- 后台通信异常向上抛出，不写入永久失败缓存。网站图标背景和缩放按书签 ID 保存，不复制为自定义图标。
- 远程 SVG 以受限图片元素加载。自定义 SVG 保存前经过 `IconSanitizer.js`，过滤脚本、嵌入对象、事件、外链及危险 URL；具体上传规则见[图标工坊](touch-icon-guide.md#图标工坊)。
- 内置书签图标库只允许人工加入审核后的 SVG 与名称关键词，匹配输入仅为书签名称。

## 本地存储

以下外观与打开偏好保存在 `localStorage`。改变存储键或数据形状时必须提供迁移方案。

| 键 | 内容 |
| --- | --- |
| `themeMode` | `light` / `dark` |
| `cardSize` / `cardRadius` | 卡片尺寸与圆角 |
| `gridPageMargin` / `cardGap` | 网格四周留白与卡片间距 |
| `cardFontFamily` | 全局字体选择 |
| `cardTitleSize` / `cardTitleTracking` | 卡片标题字号与字距 |
| `headerOpacity` | 顶部栏背景强度 |
| `openMode` | `new` / `current`，默认在后台新标签页打开 |

页面背景直接使用主题底色。已有 `backgroundEffect` / `backgroundEffectStrength` 值保留在本地，不再读取或写入；其他外观与图标偏好继续使用原键。

图标数据优先写入 `chrome.storage.local`，读取时合并已有 `localStorage` 数据，同键内容以 Chrome 存储为准。

| 键 | 索引与内容 |
| --- | --- |
| `custom_icon_cache` | 书签 ID → 用户图标及显示元数据 |
| `site_icon_cache_v2` | 完整书签 URL → 网站图标或无图标结果 |
| `site_icon_background_cache_v1` | 书签 ID → 网站图标背景与缩放 |

## 运行资源与动画

- 扩展直接加载原生 JavaScript 模块，不需要构建或运行时 npm 依赖。
- `theme-init.js` 是 `<head>` 内同步执行的经典脚本，必须早于 `css/main.css` 和 `main.js`，以便首次绘制前写入 `<html data-theme>`。配色由 CSS 令牌控制。
- `vendor/gsap.min.js` 使用经典 `<script>` 在 `main.js` 前加载。模块通过 `vendor/gsap.js` 读取 `globalThis.gsap`；UMD 文件不能直接作为模块导入。不要内联脚本或放宽 MV3 安全策略。
- GSAP 仅为开发依赖。升级后在仓库根目录执行 `npm ci` 和 `npm run vendor:gsap` 生成两个 vendor 文件，禁止手改生成物。
- `CardEffects.attach()` 以根卡片为键管理句柄，仅在 `.card-surface` 上执行轻微倾斜、磁吸和缩放。触摸、宽度 ≤768px 及系统减少动效时停用；`BookmarkCard.destroy()` 通过 `detach()` 释放句柄、事件、观察器和计时器。
- `CardNavigation` 打开网页不播放卡片或页面转场，也不等待视觉计时器。后台新标签页立即提交且保留 `active:false`，当前页取得来源标签 ID 后立即更新该标签；API 等待期间防止重复打开，失败、销毁和页面恢复会清理忙状态。文件夹打开反馈使用 `.card-surface`，不修改根卡片位移；内容入场仅在新数据提交且目录改变时播放，失焦、隐藏和减少动效会跳过视觉等待。
- `GridDragController` 独占根卡片位移，拖动与落位期间暂停悬停。拖动使用开始时的固定插槽，只在目标变化时按帧更新邻卡让位和一个占位框，松手才写入 Chrome；原生拖拽源在松手前保留原 DOM 位置。落位先批量读取位置，再执行可取消的动画；系统减少动效时直接落位。
- 文件夹左右边缘与普通卡片采用相同插入规则，中央停留 350ms 后显示「移入文件夹」。取消、松手、失焦和页面隐藏统一结束会话并清理侧栏、占位与临时高亮。
- 移动与删除侧栏是与顶部栏、窗口边缘保持留白的悬浮面板。面板显示的留存缓冲仅用于保持展开，实际松手必须命中当前可见矩形与圆角；删除侧栏进入确认弹窗后才删除。
- 设置弹层隐藏时使用 `inert` 与 `aria-hidden`，同步入口的 `aria-expanded`；分类页签通过 `hidden` 隔离非当前内容。主题与打开方式同步按钮 `aria-pressed`。卡片操作菜单使用单一可 Tab 聚焦项，方向键、Home 与 End 在菜单内导航，Escape 返回源卡焦点，Tab 关闭菜单并继续页面导航。
- `MenuInteraction` 统一登记当前临时菜单并释放外部监听。设置和卡片菜单互斥，弹窗、导航、拖拽、外部滚动及页面失焦会关闭菜单；内部滚动不会关闭，外部操作保留原生点击和焦点。模态弹窗优先接管键盘，使用 `role="dialog"` 与 `aria-modal` 表明状态。
- 页面通过 `body` 的 `--color-bg` 使用静态主题底色，不创建背景 Canvas、WebGL 上下文或持续背景渲染循环。`SettingsPanel` 仅同步主题与外观偏好；卡片悬停与拖拽动画按交互触发。

## 验证

仓库根目录执行 `npm test` 可运行全部 Node 行为测试，无需安装开发依赖。按修改范围也可选择以下命令。

| 范围 | 命令 |
| --- | --- |
| 顶部与卡片菜单 | `node --test tests/toolbar-menu.test.mjs tests/context-menu.test.mjs` |
| 设置分页与菜单协调 | `node --test tests/settings-tabs.test.mjs tests/menu-interaction.test.mjs tests/interaction-binding.test.mjs` |
| 新建入口与名称编辑 | `node --test tests/grid-create-actions.test.mjs tests/edit-title-dialog.test.mjs` |
| 工具栏快速收藏与后台通信 | `node --test tests/quick-bookmark.test.mjs tests/site-icon-background.test.mjs` |
| 排序、文件夹与导航 | `node --test tests/drag-order.test.mjs tests/grid-drag-state.test.mjs tests/grid-drag-controller.test.mjs` |
| 版本信息 | `node --test tests/version-system.test.mjs` |
| 卡片动画与文字 | `node --test tests/card-effects.test.mjs tests/card-text-reveal.test.mjs tests/card-icon-state.test.mjs` |
| 网页直接打开与文件夹动效 | `node --test tests/card-navigation.test.mjs` |
| 主题、静态背景与偏好兼容 | `node --test tests/theme-mode.test.mjs tests/background-effect.test.mjs` |
| 图标解析与上传 | `node --test tests/icon-sanitizer.test.mjs tests/icon-library-provider.test.mjs tests/icon-resolver.test.mjs tests/icon-component-integration.test.mjs tests/bitmap-icon-upload.test.mjs` |
| 图标背景与网站图标 | `node --test tests/icon-background.test.mjs tests/site-icon-resolver.test.mjs tests/site-icon-background.test.mjs` |
| JS 语法 | `node --check <修改的文件>` |
| Git 空白 | `git diff --check` |

静态检查还包括：清单 JSON 与实际权限、改动 CSS 的括号、文档中的路径与锚点、UTF-8 无 BOM、替换字符与疑似乱码。文档须与当前实现一致，不保留变更经过或废弃方案。

触控、弹窗、拖拽、图标和 Chrome API 改动需要重新加载扩展后做运行态验证。开始视觉检查或较长链路前，先让用户选择执行人；优先使用真实 Chrome session。写入或删除真实书签前说明风险，选择只读检查、测试数据或用户确认的隔离方案。

## 文件卫生

- `.gitattributes` 将文本固定为 LF，图片为 binary；中文文件使用 UTF-8 无 BOM。
- `.gitignore` 忽略依赖、本机 Agent 状态目录和日志；不提交运行态或凭据。
- 版本以 `manifest.json` 为准，README 当前版本与徽章同步；修改后运行版本测试。
