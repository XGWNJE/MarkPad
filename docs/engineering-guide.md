# MarkPad 工程指南

本文描述当前代码职责、数据边界与验证方法。用户操作见 [README](../README.md)，协作入口见 [AGENTS.md](../AGENTS.md)。

## 文件职责

| 位置 | 职责 |
| --- | --- |
| `manifest.json` | 名称、安装版本、权限、新标签页与后台入口 |
| `index.html` / `main.js` / `theme-init.js` | 页面结构、组件装配与全局交互、首次绘制前的主题初始化 |
| `core/BookmarkStore.js` | Chrome 书签读写、树与子项查询、图标数据和缓存 |
| `core/Router.js` / `core/EventBus.js` | 文件夹导航与浏览器历史、组件间事件通信 |
| `core/IconLibrary.js` | 应用 UI 的线性 SVG 图标，包括默认文件夹图标 |
| `core/icons/` / `background.js` | 书签图标解析、上传处理、安全清理及网站声明抓取 |
| `components/BookmarkGrid.js` / `BookmarkCard.js` | 卡片网格、新建入口、选择、排序及单卡片交互 |
| `components/Breadcrumb.js` / `EditDialog.js` / `MoveDialog.js` | 面包屑、新建与编辑弹窗、移动目标选择 |
| `components/IconStudio.js` / `SettingsPanel.js` | 图标工坊、主题与外观偏好 |
| `components/CardEffects.js` / `BackgroundEffect.js` | 卡片指针动画、WebGL2 背景光效 |
| `css/` / `icons/` / `assets/` | 样式、应用图标、展示资源；样式分工见[视觉规范](markpad-brand-visual-guide.md#样式维护) |
| `vendor/` / `scripts/vendor-gsap.mjs` | 内置 GSAP 及其生成脚本 |
| `tests/` / `docs/` | Node 行为测试与当前专题文档 |

## 书签与事件

- `BookmarkStore` 封装 `chrome.bookmarks`；根文件夹 ID 通过 `getRootFolderIds()` 动态解析。书签修改直接作用于 Chrome 数据。
- 组件业务动作通过 `EventBus` 通信。新建卡片和快捷键发出 `toolbar:newBookmark` / `toolbar:newFolder`，`EditDialog` 在当前文件夹创建；网格监听 `navigate` 更新内容。
- 删除通过 `card:requestDelete` 进入 `main.js` 确认弹窗，确认后发出 `card:delete` 执行；文件夹必须展示子项数量。
- 网格末尾保留新建书签与新建文件夹两张操作卡片。它们不参与书签选择、排序和删除。
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
| `backgroundEffect` / `backgroundEffectStrength` | 背景光效开关与强度百分比 |
| `openMode` | `new` / `current`，默认在后台新标签页打开 |

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
- `CardEffects.attach()` 挂载卡片动画，销毁卡片时释放句柄。当前启用倾斜、磁吸和缩放；触摸、宽度 ≤768px 及系统减少动效时停用。
- 卡片指针动画和拖拽排序共用 inline `transform`。接管前调用 `releaseEffectsTransform()`，内部 `CardEffect.releaseTransform()` 会终止 GSAP 动画并清理 transform；拖拽开始及 `applyOptimisticReorder()` 已按此交接。
- `BackgroundEffect` 使用原生 WebGL2 全屏三角形和片元着色器，不新增运行时依赖。画面挂在 `#background-effect-layer`，固定全屏、`z-index: -1`、`pointer-events: none`。
- 背景配色只来自 `--background-effect-bg` 与 `--background-effect-color1/2/3`。浅色混色、深色透明加色；`SettingsPanel` 控制创建、销毁、主题和强度。
- 背景像素比上限为 1.5；`IntersectionObserver` 与 `visibilitychange` 暂停不可见页面的动画。减少动效时仅绘制静态画面，初始化失败或 WebGL2 不可用时保持纯色背景；上下文恢复时重建渲染资源。

## 验证

仓库根目录执行 `npm test` 可运行全部 Node 行为测试，无需安装开发依赖。按修改范围也可选择以下命令。

| 范围 | 命令 |
| --- | --- |
| 顶部与卡片菜单 | `node --test tests/toolbar-menu.test.mjs tests/context-menu.test.mjs` |
| 新建入口与名称编辑 | `node --test tests/grid-create-actions.test.mjs tests/edit-title-dialog.test.mjs` |
| 版本信息 | `node --test tests/version-system.test.mjs` |
| 卡片动画与文字 | `node --test tests/card-effects.test.mjs tests/card-text-reveal.test.mjs tests/card-icon-state.test.mjs` |
| 主题与背景光效 | `node --test tests/theme-mode.test.mjs tests/background-effect.test.mjs` |
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
