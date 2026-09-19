# AGENTS.md

本文档为 Codex 提供本仓库的代码协作指引。README 面向用户；本文件面向 Agent，负责项目边界、文件职责、验证步骤和历史包袱处理。

## 项目边界

- 产品名已确定为 **MarkPad**。用户可见位置必须使用 MarkPad，包括 `manifest.json`、`index.html` title、README、图标导出页和发布说明。
- 仓库目录为 `C:\Users\xgwnj\Documents\XGWNJE\MarkPad`（由旧目录 `BookmarkTab` 迁入）；内部类名如 `BookmarkStore`、`BookmarkCard` 表示书签领域对象，不作为产品品牌。不要为了品牌统一批量重命名文件、类、事件或存储 key，除非用户明确要求迁移。
- 当前视觉规范优先参考 `D:\ObjectCode\visual-rules-collection\rules\lumen-index-ui-system.md`：温白/深灰背景、黑白骨架、轻边框、低阴影、克制密度。
- 品牌方向见 `docs/markpad-brand-visual-guide.md`；当前触控与图标行为见 `docs/touch-icon-guide.md`。
- `CLAUDE.md` 只是旧工具兼容入口，不再维护独立规则内容。

## 文档分工

- `README.md`：用户入口，只保留项目定位、功能、安装、快捷键、结构摘要、验证和权限。
- `AGENTS.md`：Agent 入口，维护架构、边界、验证、危险操作和历史负担说明。
- `docs/`：当前有效的专题设计与产品行为说明。实施过程和已完成计划不要长期留在仓库中。
- 不要在 README、AGENTS、docs 之间复制大段同义内容；发现重复时按读者职责归位。

## 版本与变更记录

- `manifest.json` 的 `version` 是安装版本号来源，使用 `major.minor.patch` 格式。
- `CHANGELOG.md` 记录完整版本历史，顶部保留 `Unreleased`，发布时把条目归入对应版本和日期。
- README 只保留当前版本摘要并链接 `CHANGELOG.md`，不要复制完整变更记录。
- 改动 `manifest.json` 版本号、README 版本摘要或 `CHANGELOG.md` 时，同步运行 `node --test tests\version-system.test.mjs`。

## Verification

项目目前只有轻量 Node 行为测试，无构建步骤。代码修改后优先运行与改动范围匹配的轻量检查：

- UI 入口/菜单行为测试：`node --test tests\toolbar-menu.test.mjs tests\context-menu.test.mjs`
- 版本记录一致性测试：`node --test tests\version-system.test.mjs`
- 卡片光效接线测试：`node --test tests\card-effects.test.mjs`
- 卡片文字展开测试：`node --test tests\card-text-reveal.test.mjs`
- 主题模式测试：`node --test tests\theme-mode.test.mjs`
- 图标解析/安全/上传测试：`node --test tests\icon-sanitizer.test.mjs tests\icon-storage.test.mjs tests\icon-library-provider.test.mjs tests\icon-resolver.test.mjs tests\icon-component-integration.test.mjs tests\bitmap-icon-upload.test.mjs`
- JavaScript 语法检查：`node --check <file>`
- Chrome 扩展清单检查：确认 `manifest.json` JSON 合法且权限与实际功能匹配
- CSS 结构检查：至少确认改动模块括号匹配
- 文档变更：确认 README、AGENTS 和 `docs/` 中没有过时路径、旧产品名或未实现承诺
- 编码检查：中文 Markdown/JSON/JS/CSS 修改后确认 UTF-8 无 BOM，且没有疑似 mojibake 或替换字符
- Git 空白检查：`git diff --check`

涉及触控交互、弹窗、拖拽、图标工坊、图标库或 Chrome API 行为时，需要在 Chrome 扩展页面刷新后做运行态验证。默认优先连接用户真实 Chrome session；若验证会写入或删除真实书签数据，必须先说明风险并改用只读路径、测试数据或用户确认的隔离方案。

## 架构

```
MarkPad/
├── CHANGELOG.md  # 版本历史和发布变更
├── assets/          # README 展示资源
├── components/     # UI 组件
├── core/           # 数据层、事件、路由、应用图标和书签图标解析
│   └── icons/      # 默认书签图标解析、SVG 清理、位图校验和生成数据
├── css/            # main.css 入口 + modules/ 模块
├── docs/           # 品牌、触控和图标行为说明
├── icons/          # 扩展图标 + export.html
├── scripts/        # 图标数据与 vendor 文件的生成脚本
├── tests/          # 轻量 Node 行为测试
├── vendor/         # 内置的第三方运行时代码（gsap）
├── index.html      # 新标签页入口
├── theme-init.js   # 首次绘制前决定浅色/深色（经典脚本）
├── main.js         # 应用装配与全局交互
└── manifest.json   # Chrome 扩展清单 V3
```

### 核心层（./core/）

- **BookmarkStore.js** — 数据层，封装 `chrome.bookmarks` API。负责增删改查、历史 favicon 缓存兼容、自定义图标存储、默认图标解析缓存、书签树查询、文件夹子项数量统计。图标缓存优先写入 `chrome.storage.local`，并兼容旧 `localStorage` 数据。根文件夹（书签栏/其他书签）ID 必须经 `getRootFolderIds()` 动态解析：Chrome 账号书签模式下永久文件夹 ID 不再固定为 1/2/3，禁止硬编码。
- **IconLibrary.js** — 本地应用图标库。应用自身图标统一由这里输出线性 SVG；书签默认图标不经过这里。
- **core/icons/** — 书签图标域。`IconResolver.js` 按自定义图标、解析缓存、本地品牌/通用图标库、首字母兜底的顺序解析；`IconLibraryProvider.js` 使用生成后的 Simple Icons、Iconify Logos、Remix、Ant Design、Lobe Icons 和 Lucide 数据，品牌匹配优先，通用工具/信息图标只在品牌未命中后回落；全量扩展库可用于本地图标候选搜索，但自动匹配只允许明确品牌白名单，候选列表展示标题、URL、完整域名、主域名、域名片段、路径片段和匹配依据；`IconSanitizer.js` 负责 SVG 清理；`BitmapIconProcessor.js` 要求上传位图原始尺寸至少 256×256。`core/icons/generated/*.generated.js` 由 `npm run generate:icons` 生成，不要手改。
- **IconSourceProvider.js** — 外部 SVG 图标源适配层。混排 iconfont、Iconify 和 SVG API；iconfont API 不返回可用 SVG 时，可后台打开/复用与当前关键词匹配的 iconfont 搜索页并抽取 SVG。不得读取不匹配关键词的旧 iconfont 页面。
- **Router.js** — 导航层，管理文件夹层级与浏览器历史集成。
- **EventBus.js** — 发布/订阅事件系统，解耦组件。

### 组件层（./components/）

- **BookmarkGrid.js** — 网格容器，渲染当前文件夹的书签卡片。负责卡片多选、拖拽排序、删除执行和刷新协调。
- **BookmarkCard.js** — 单张书签/文件夹卡片。通过 `IconResolver` 展示默认/自定义图标，支持拖拽、右键菜单、行内标题编辑、自定义图标、Toast 提示。
- **Breadcrumb.js** — 头部面包屑导航。
- **Toolbar.js** — 常驻顶部工具栏，处理搜索图标和设置菜单内的新建书签/文件夹动作，并通过 EventBus 发射对应事件。
- **EditDialog.js** — 新建/编辑书签或文件夹弹窗。
- **MoveDialog.js** — 右键菜单“移动到...”目标文件夹弹窗。
- **QuickFind.js** — 全局模糊搜索浮层（`/` 或 `Ctrl+F`）。
- **IconStudio.js** — 图标工坊弹窗。提供本地图标候选和外部 SVG 搜索两种模式，支持预览和直接应用；不接入模型 API 或生图功能。
- **SettingsPanel.js** — 设置菜单里的外观偏好模块，按主题、书签卡片和顶部栏组织设置；负责浅色/深色切换、卡片尺寸/背景强度和顶部栏背景强度。主题只有两种：`theme-init.js` 在首次绘制前写好 `<html data-theme>`，实际配色由 `variables.css` 的 `:root[data-theme="dark"]` 令牌决定；不要再引入跟随系统之外的主题状态、壁纸或自定义背景图片。
- **CardEffects.js** — 卡片光效控制器，移植自 React Bits 的 MagicBento（原组件为 React + gsap）。单例系统统一跟光标：全局聚光层、每张卡片的边缘光晕强度、粒子、3D 倾斜、磁吸和点击涟漪。`BookmarkCard.render()` 调 `CardEffects.attach(element)` 挂载，删除卡片时 `destroy()`；离场卡片在系统刷新时自动注销。触摸设备、宽度 ≤768px 和 `prefers-reduced-motion` 下自动停用，由 `card.css` 的静态悬停反馈兜底。光效只写 `--glow-*` 变量和 `transform`，颜色一律来自 CSS 令牌。

## CSS 维护规则

- 先改 `variables.css` 中的 Lumen 风格 token，再映射到组件模块；避免在组件里散落 magic number。
- 视觉统一只改既有界面的颜色、间距、圆角、阴影、状态和密度；不要新增品牌块、底部栏、说明卡片、装饰图形或额外入口，除非用户明确要求。
- 卡片文字默认收起，卡片保持正方形；悬停或键盘聚焦时 `.card-info` 从底部动画展开，盖在图标之上，**不能改变卡片尺寸**（否则网格会重排）。触屏和手写笔没有悬停，由 `BookmarkCard.revealTextOnTap()` 用首次点按展开、再次点按才执行打开。文字状态只由 `:hover` / `:focus-visible` / `:focus-within` / `.text-revealed` 驱动，不要再恢复 `showCardText` 一类的显隐开关或 `[data-show-card-text]` 属性。
- 应用自身图标必须使用 `core/IconLibrary.js` 作为统一入口；新增或替换应用 UI 图标时，最优先使用成熟图标库或现成图标源的路径数据，例如 Lucide、Iconify 或 Material Symbols。
- 书签默认图标必须走 `core/icons/IconResolver.js`，默认顺序是用户自定义图标、`resolved_icon_cache_v1`、本地品牌图标库、通用工具/信息图标库、首字母兜底。自动匹配保持保守：品牌优先考虑用户标题中的完整品牌/产品短语，再考虑域名和标题 token；Remix、Ant Design 和 Lobe Icons 的全量扩展库只对明确品牌白名单自动命中，其他图标只能作为手动候选；通用 Lucide 图标只对明确词如 database、docs、api、server、calendar、terminal 等回落匹配；不要恢复启动时批量抓取 favicon。用户觉得默认匹配不准时，通过 `图标：匹配本地图标` 打开可解释候选列表并手动应用。
- 如果本仓库当前没有合适图标，优先评估能否引入或复用成熟图标库；自己绘制 SVG/path 是最后选择项，只能在现成库无法满足、无法引入依赖或用户明确要求定制时使用。
- 必须手写图标时，先说明原因，并仍然集中放入 `core/IconLibrary.js`；不要重新引入 emoji、字符图标或散落的内联 SVG。
- 用户自定义图标最高优先级：SVG 可来自本地图标候选或图标工坊搜索，并在保存前清理；位图上传必须用原始解码尺寸校验，宽高都不低于 256px。
- 触控目标保持不小于 44px；弹窗和图标工坊必须保留粗指针友好布局。
- 卡片光效颜色只在 `variables.css` 定义：`--card-glow-rgb`、`--card-glow-peak`（描边光晕峰值）、`--card-glow-radius`、`--card-spotlight-blend/peak`（全局聚光）。亮色主题用墨色 + `multiply`，深色主题用中性浅灰 + `screen`，不要再引入独立品牌色或紫色霓虹。改颜色只改令牌，`card.css` 与 `components/CardEffects.js` 都不写死色值。
- 主题只有浅色和深色两套，令牌分别挂在 `:root` 和 `:root[data-theme="dark"]`；**不要恢复 `@media (prefers-color-scheme: dark)` 里的颜色令牌**，否则会和手动选择打架。深色保持中性深灰且卡片只比背景亮一阶，亮色保持温白，两边都维持轻度对比。

关键模块：
- `variables.css` — Lumen Index 风格设计令牌。
- `toolbar.css` / `breadcrumb.css` / `shortcuts.css` — 头部工具、面包屑和工具菜单。
- `card.css` / `grid.css` — 卡片与网格。
- `dialog.css` / `quick-find.css` / `icon-studio.css` — 弹窗、搜索、图标工坊。
- `drag-zones.css` — 左侧移动面板和右侧删除区域。
- `settings.css` — 设置面板与偏好控件。

## 关键模式

**事件驱动通信**：组件间通过 EventBus 通信，不直接互调业务动作。`Toolbar` 发射 `toolbar:newBookmark`，`EditDialog` 处理；`BookmarkGrid` 监听 `navigate`。

**删除确认**：删除统一通过 `card:requestDelete` 进入 `main.js` 的确认弹窗，再由确认按钮发射 `card:delete` 执行删除。文件夹删除必须显示包含子项数量。

**图标安全**：自定义 SVG 在存储前必须通过 `core/icons/IconSanitizer.js` 清理。移除可执行/嵌入/外链相关元素，过滤 `on*`、`javascript:`、`data:`、外部 `xlink:href` 和 `style url(...)` 等风险。

**图标工坊**：当前只做本地图标候选、SVG 搜索、候选来源/匹配依据标注、预览和直接应用。不新增 API key、模型选择、生图、高清生成或自动批量生成。

**本地偏好**：卡片尺寸、打开方式、卡片背景强度、主题和顶部栏背景强度保存在 `localStorage`：`themeMode` 记录 `light` / `dark`，`cardBackgroundStrength` 控制卡片背景强度，`headerOpacity` 控制顶部栏背景强度。不要无迁移方案地改 key。旧 `showCardText` 和壁纸相关 key（`wallpaperId`、`wallpaperFit`、`wallpaperBlur`、`wallpaperOverlayOpacity`、`wallpaperCustomImage`）已随功能移除，不要再读写。

**卡片 transform 归属**：卡片光效（gsap 倾斜/磁吸）和网格的拖拽 FLIP 排序都会写同一张卡片的 inline `transform`。谁接管前必须显式交接：光效侧统一走 `CardEffect.releaseTransform()`（`gsap.killTweensOf` + `clearProps: 'transform'`），`dragstart` 和 `BookmarkGrid.applyOptimisticReorder()` 开头都会调用。以后新增写卡片 transform 的逻辑时，必须同样先交接，避免 gsap 的 transform 缓存和外部写入值不一致导致跳动。

## 工程卫生

- 无构建步骤。纯 ES Modules 直接由扩展加载，只有两个刻意保留的经典 `<script>`：
  - `vendor/gsap.min.js`：它的 UMD 结尾会执行 `(t = t || self).window = t.window || {}`，模块作用域是严格模式，导入它会直接抛 `Cannot set property window`，因此模块侧只能 `import { gsap } from '../vendor/gsap.js'`，不要改回模块导入。`gsap` 与其他图标库一样只作为 devDependency 存在，改版本后运行 `npm run vendor:gsap` 重新生成 `vendor/` 下的两个文件，不要手改生成物。
  - `theme-init.js`：模块是 deferred 的，等 HTML 解析完才执行，深色模式用户会先看到一帧亮色；经典脚本同步执行，能在首次绘制前写好 `<html data-theme>`，所以它必须在 `index.html` 的 `<head>` 里、且排在 `css/main.css` 和 `main.js` 之前。同理不要在 `index.html` 里内联脚本：MV3 的 CSP 不允许 `unsafe-inline`。
- `simple-icons`、`@iconify-json/simple-icons`、`@iconify-json/logos`、`@iconify-json/lucide`、`@iconify-json/ri`、`@iconify-json/ant-design`、`@lobehub/icons-static-svg` 和 `gsap` 都只作为生成或内置用的 devDependency，不要变成运行时 `import` 的 npm 包。
- 做扩展运行态验证时，优先连接用户真实 Chrome profile/session；只有真实 Chrome 不可用或用户明确要求隔离时，才使用临时 profile。
- `.gitignore` 忽略本地 Agent/工具状态目录（如 `.codex/`、`.agents/`、`.openharness/`）和日志，不要提交本机运行态。
- `.gitattributes` 固定文本 LF，并把图片资源标记为 binary。
- 不主动提交；需要提交时先检查 `git status`，不要混入无关文件。
