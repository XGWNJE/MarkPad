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
2. `书签卡片`：调整卡片尺寸、圆角和页面边距；圆角上限会随实际卡片边长同步到圆形，页面边距同时作用于网格四周留白。
3. `文字`：调整卡片标题与域名的字体、标题字号、字重和字距；默认使用标准字重与抗锯齿渲染，避免不规则字重造成毛边。
4. `顶部栏`：调整导航和工具按钮背后的背景强度。

卡片尺寸支持 80–200 的七档调节，每档必须产生可见的卡片宽度变化；`=` / `-` 快捷键与设置滑块使用同一状态。卡片默认没有衬底和描边。

卡片标题默认收起，卡片保持正方形。指针悬停或键盘聚焦时文字面板从底部动画展开，覆盖在图标之上，不改变卡片尺寸、不触发网格重排；触屏和手写笔没有悬停，第一次点按先展开文字，再点一次才打开书签，点按卡片以外区域收起。文字展开状态只由 CSS 的 `:hover` / `:focus-visible` / `:focus-within` 和 `.text-revealed` 驱动，没有独立的偏好开关。

主题在首次绘制前由 `theme-init.js` 写入 `<html data-theme>`：`localStorage` 没有 `themeMode` 时按系统深浅色取初值，用户选过之后一直按选择走。配色令牌只存在于 `variables.css` 的 `:root` 和 `:root[data-theme="dark"]`，不再跟随 `prefers-color-scheme` 媒体查询。

现有本地偏好 key：`themeMode`、`cardSize`、`cardRadius`、`gridPageMargin`、`cardGap`、`cardFontFamily`、`cardTitleSize`、`cardTitleWeight`、`cardTitleTracking`、`headerOpacity`、`openMode`。其中 `gridPageMargin` 控制卡片容器与页面四周的留白，`cardGap` 控制卡片之间的距离。壁纸功能已整体移除，`wallpaperId`、`wallpaperFit`、`wallpaperBlur`、`wallpaperOverlayOpacity`、`wallpaperCustomImage`、`showCardText` 和 `cardBackgroundStrength` 都不再读写。

## Icon Studio

图标工坊只提供两项能力：

1. 显示当前版本内置图标库中、仅由书签名称命中的候选。
2. 上传 SVG、PNG/APNG、GIF、JPG 或 WebP 图标，并直接应用。

内置库初始为空，后续仅通过版本更新逐项加入人工筛选过的图标、SVG 和名称关键词；不提供外部 SVG 搜索、iconfont、Iconify、API key 或 AI 生图。

上传动态图不经 Canvas 转码：GIF、APNG 和安全 SVG 动画会保持原始播放。背景只提供原样、自动融合、黑、白与自定义五种策略；自动融合只读取第一帧图标边缘，复杂边缘生成 2–3 色渐变。自定义色以 HEX 为真值，并通过色轮、明暗面板或 Chrome 屏幕取色实时预览；背景只是显示元数据，不会改写原始动图。

上传图标与已显示的网站图标都能在图标编辑器中调整 40%–400% 的缩放比例，拖动时实时预览；缩放按书签保存，不改变卡片边界。网站图标编辑过程会临时同步到原卡片，取消即恢复；背景和缩放按书签单独保存，不会将网站图标变成自定义图标。网站图标缓存命中后会一直复用；只有用户选择「图标：重新获取网站图标」时才重新访问网站，自动融合也只会在这次手动更新后重新分析。

## Default Icon Resolution

默认书签图标按以下顺序解析：

1. 用户自定义图标。
2. 仅按书签名称匹配的内置图标库。
3. 网站页面声明的图标资源。
4. 无图标状态。

内置图标自动匹配不读取 URL、域名或路径，也不显示首字母、emoji 或通用占位图标。网站图标只在卡片首次进入可见区域后按需解析，识别 `icon`、`shortcut icon`、`apple-touch-icon`、Manifest 图标和同源 `/favicon.ico`；不在启动时批量请求。网站图标按完整书签 URL 永久缓存，包括未找到图标的结果；只有右键菜单的「图标：重新获取网站图标」会清除该条缓存并重新访问网站。

网站资源仅用于显示网站自己声明的图标；不使用 Google favicon 或 Chrome `_favicon` 回退。远程资源以受限图片元素加载，不把网站 SVG 注入页面 DOM。

## Custom Icon Storage

- 上传 SVG 保存前必须经过 `IconSanitizer` 清理；允许安全的 SMIL 动画，拒绝脚本、事件、外链、嵌入对象和 `foreignObject`。
- 位图上传使用原始解码尺寸校验，宽高都不得低于 256px；静态图片不超过 1MB，GIF、APNG、动态 WebP 和 SVG 动画不超过 10MB。
- 用户自定义图标保存在 `custom_icon_cache`，优先级最高。
- 自定义图标记录同时保存原始图像/SVG 与背景策略；旧字符串记录按原样显示兼容读取。
