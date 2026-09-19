# MarkPad Touch And Icon Guide

本文档只记录当前有效的触控交互与书签图标行为。Agent 维护规则、安全边界和验证命令以 `AGENTS.md` 为准。

## Product Direction

MarkPad 是面向远程平板触控 PC 场景的新标签页书签面板。主要操作应适合手指低精度输入，同时兼容鼠标和键盘。

- 主要触控目标不小于 `44px`，粗指针布局不能依赖 hover。
- 长按卡片与右键打开同一操作菜单。
- 删除统一进入确认弹窗，文件夹删除显示子项数量。
- 顶部工具栏和工具菜单是主控制区，不额外增加底部操作栏。
- 精细拖拽排序面向鼠标；触控场景优先保证打开、长按和弹窗操作稳定。

视觉样式使用 `css/modules/variables.css` 中的 Lumen Index 令牌：温白或深灰背景、黑白骨架、轻边框、低阴影和克制密度。

## Appearance Settings

设置菜单按作用对象分为三个外观区域：

1. `主题`：浅色或深色。深色统一使用中性深灰，卡片只比背景亮一阶，保持轻度对比。
2. `书签卡片`：调整卡片尺寸和卡片背景强度。
3. `顶部栏`：调整导航和工具按钮背后的背景强度。

卡片尺寸支持 80–200 的七档调节，每档必须产生可见的卡片宽度变化；`=` / `-` 快捷键与设置滑块使用同一状态。背景强度数值越高，界面衬底越实。

卡片标题默认收起，卡片保持正方形。指针悬停或键盘聚焦时文字面板从底部动画展开，覆盖在图标之上，不改变卡片尺寸、不触发网格重排；触屏和手写笔没有悬停，第一次点按先展开文字，再点一次才打开书签，点按卡片以外区域收起。文字展开状态只由 CSS 的 `:hover` / `:focus-visible` / `:focus-within` 和 `.text-revealed` 驱动，没有独立的偏好开关。

主题在首次绘制前由 `theme-init.js` 写入 `<html data-theme>`：`localStorage` 没有 `themeMode` 时按系统深浅色取初值，用户选过之后一直按选择走。配色令牌只存在于 `variables.css` 的 `:root` 和 `:root[data-theme="dark"]`，不再跟随 `prefers-color-scheme` 媒体查询。

现有本地偏好 key：`themeMode`、`cardSize`、`cardBackgroundStrength`、`headerOpacity`、`openMode`。壁纸功能已整体移除，`wallpaperId`、`wallpaperFit`、`wallpaperBlur`、`wallpaperOverlayOpacity` 和 `wallpaperCustomImage` 以及 `showCardText` 都不再读写。

## Icon Studio

图标工坊提供两条人工修正路径：

1. `图标：匹配本地图标` 根据标题、URL、域名和路径生成可解释候选，允许追加关键词筛选。
2. `图标：搜索 SVG` 查询 iconfont、Iconify 和 SVG API，显示候选来源并在应用前清理 SVG。

图标工坊不接入模型 API，不保存 API key，也不提供 AI 生图或高清生成。

iconfont API 不可用时，系统只允许打开或复用与当前关键词匹配的搜索页并提取 SVG；不得读取不匹配关键词的旧页面。iconfont 仍不可用时，继续使用 Iconify 与 SVG API 候选。

## Default Icon Resolution

默认书签图标按以下顺序解析：

1. 用户自定义图标。
2. `resolved_icon_cache_v1` 中与当前匹配器版本兼容的解析缓存。
3. 本地品牌图标库。
4. Lucide 通用工具或信息图标。
5. 首字母兜底。

自动匹配保持保守：完整品牌或产品短语优先，其次考虑域名和标题词；扩展品牌库只有明确白名单可以自动命中。通用图标只对 database、docs、api、server、calendar、terminal 等明确概念回落匹配。

本地图标数据位于 `core/icons/generated/`，由 `npm run generate:icons` 生成，运行时不联网读取图标库，生成文件不得手改。

## Custom Icon Storage

- 本地候选和外部 SVG 保存前必须经过 `IconSanitizer` 清理。
- 位图上传使用原始解码尺寸校验，宽高都不得低于 256px。
- 用户自定义图标保存在 `custom_icon_cache`，优先级最高。
- 自动解析结果保存在 `resolved_icon_cache_v1`；重新匹配默认图标不得删除用户自定义图标。
