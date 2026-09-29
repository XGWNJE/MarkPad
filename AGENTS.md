# AGENTS.md

MarkPad 的 Agent 协作入口。先遵循用户全局规则，再遵循本文；实现细则通过下方索引读取。

## 项目定位

- MarkPad 是面向鼠标和触控操作的桌面 Chrome 新标签页书签面板，直接使用 Chrome 原生书签。
- 扩展采用 Manifest V3、原生 JavaScript 模块和 CSS，无构建步骤；运行资源随仓库提供。
- `manifest.json` 的 `version` 是安装版本号来源，使用 `major.minor.patch` 格式；README 的当前版本与徽章必须一致。

## 工作边界

- 用户可见名称统一为 MarkPad；`Bookmark*` 是书签领域命名，文件、事件和存储键的改名须有明确需求与迁移方案。
- 修改范围以用户要求为准；不主动提交或推送，提交前核对 `git status`，不混入无关文件。
- 文档只描述当前真实状态。功能变化时同步正文、示例与索引，入口保持简短，细则归入对应专题。
- 书签读写、图标获取与缓存、事件通信及卡片动画交接遵循[工程指南](docs/engineering-guide.md)。
- 视觉修改先调整 CSS 令牌，使用现有界面与入口；具体边界见[品牌与视觉规范](docs/markpad-brand-visual-guide.md)。
- 上传图标经过安全清理或尺寸校验；格式、动画、背景和触控行为以[触控与图标说明](docs/touch-icon-guide.md)为准。
- 密钥、token、私钥和生产配置不得写入公开文件或版本历史。

## 文档索引

| 文档 | 职责 |
| --- | --- |
| [README.md](README.md) | 用户入口：定位、功能、安装、快捷键与权限摘要 |
| [工程指南](docs/engineering-guide.md) | 架构、存储、工程约束与验证命令 |
| [触控与图标说明](docs/touch-icon-guide.md) | 卡片交互、图标来源与图标工坊 |
| [品牌与视觉规范](docs/markpad-brand-visual-guide.md) | 品牌、配色、样式模块与动效边界 |
| [CLAUDE.md](CLAUDE.md) | 指向本文件的工具兼容入口 |

## 验证与交付

- 完成后按[验证清单](docs/engineering-guide.md#验证)执行快速检查，修复本次改动引入的问题。
- 版本或 README 版本信息变化时运行 `node --test tests/version-system.test.mjs`。
- 视觉检查或较长操作链路开始前，让用户选择由 Agent 验证或按验收步骤自行检查。
- Chrome 运行态验证优先使用用户真实 session；涉及真实书签写入或删除时，先说明风险，采用只读路径、测试数据或用户确认的隔离方案。
- 交付只列出本轮需要用户验收的内容与步骤。
