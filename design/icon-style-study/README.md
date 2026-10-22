# MarkPad 图标风格案例

打开 [图标风格对照页](index.html)，切换 A—F 浏览整套，或用「同项对比」比较同一个入口。点按图标可同时查看浅深底板下的放大效果；「面板效果」模拟 MarkPad 的标题遮罩。页面可直接从本地打开，无安装或构建步骤。

## 当前内容

正式书签导出中的 98 条记录仅用于选取案例。这里保留 12 个网站和「长期留存、分享、视觉」3 个文件夹的名称，共 6 套、90 枚样例；不包含原始导出、完整书签地址或查询参数。

| 方向 | 表现 | 资源 |
| --- | --- | --- |
| A | 品牌彩色扁平 | SVG |
| B | 品牌单色浮雕 | SVG |
| C | 原创双色几何 | SVG |
| D | 原创柔和立体 | SVG |
| E | 品牌软陶材质 | 透明 PNG |
| F | 原创磨砂玻璃 | 透明 PNG |

这里保留六套选型样例。正式实现采用品牌软陶与彩色扁平两套，见[全量对照页](../builtin-icons/index.html)；同站点复用资产，泛名称不作宽泛自动匹配。

## 素材与来源

- `icons/`：90 枚最终样例；A—D 已通过项目现有 SVG 清理器。
- `sources/` 与 [来源清单](sources.json)：公开品牌参考。优先使用官方资源，补充 Lobe Icons、Simple Icons 的路径数据；品牌标识仍归各自所有者。Figma、Gmail、123云盘的几何结构按公开参考重绘，Outlook 采用经典标识。
- `references/`：品牌与原创符号的透明参考渲染；`generation/`：两套原生 ImageGen 图标的提示词和原始产物记录。PNG 保留原生生成输出，未作程序抠图或重编码。
- `build-vectors.mjs`：重建 60 枚 SVG 与生成用参考图，使用已有 `sharp` 或 Codex 工作区依赖，可用 `MARKPAD_SHARP_PATH` 指定其安装目录。只重建本研究目录，不触及扩展运行代码。
- `prepare-sources.py`：重新获取公开品牌参考；VisionGuard 使用相邻项目中的正式浅色版 SVG，不修改该项目。

## 检查

运行 `node design/icon-style-study/verify.mjs` 检查这 90 枚样例。正式库的检查方法与生成来源见[内置图标说明](../builtin-icons/README.md)。
