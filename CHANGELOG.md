# 更新日志

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范。

## [Unreleased]

### 计划中
- 支持更多 LLM 提供商 (OpenAI, Anthropic, Google)
- 文件引用 (@file) 功能
- 斜杠命令 (/explain, /fix, /tests)
- Follow-up 建议芯片
- 对话分支与重新生成
- 多工作区支持
- 讨论模板

---

## [0.1.0] - 2025-06-24

### 首次发布

#### 核心功能
- **多 AI 圆桌讨论系统** — 多个 AI 角色(架构师、代码审查员、实现工程师等)围绕项目进行深度讨论
- **五阶段讨论流程** — 项目熟悉 → 认知对齐 → 提案/互评(多轮) → 共识 → 方案生成
- **自由对话模式** — 用户与多个 AI 像群聊一样实时对话,随时生成方案
- **并行讨论** — 所有 AI 同时熟悉项目、对齐认知、提案互评,互不打断

#### AI 工具系统
- `list_files` — 列出目录内容,支持递归
- `read_file` — 读取任意文件完整内容
- `search_files` — glob 搜索文件名或 grep 搜索内容
- `write_file` — 写入文件(需用户确认)
- `execute_command` — 执行终端命令(需用户确认)
- Agent 循环: LLM 回复 → 调用工具浏览代码 → 基于工具结果继续回复,最多 5 轮

#### 用户界面 (Copilot Chat 风格)
- Markdown 渲染(react-markdown + remark-gfm),支持代码块语法高亮、表格、列表
- 代码块带标题栏(语言名 + 复制按钮)
- 工具调用可折叠卡片(图标 + 状态指示 + 参数摘要 + 结果展开)
- 流式光标动画 + 三点跳动加载指示器
- 智能滚动(用户向上滚动时暂停自动跟随,显示"回到底部"按钮)
- 消息悬停复制按钮
- 错误内联到聊天流(持久显示,不自动消失)
- 内联工具审批(替代 VS Code 原生模态对话框,60秒超时自动拒绝)

#### 输入区
- 多行 textarea(自动调整高度,Enter 发送,Shift+Enter 换行)
- 发送/停止按钮切换(流式生成时变为红色停止方块)

#### LLM 适配
- DeepSeek API 支持(deepseek-chat, deepseek-reasoner)
- `reasoning_content` 传回支持(deepseek-reasoner 多轮工具调用)
- OpenAI 兼容协议(function calling, 流式 SSE)
- 连通性测试 + 模型自动拉取

#### 角色预设
- 架构师、代码审查员、实现工程师、产品顾问、性能优化师、测试工程师
- 每个预设自动填充名称、颜色、角色提示词

#### 安全
- API Key 存储在 VS Code SecretStorage(加密)
- 危险操作(写文件、执行命令)需用户内联确认
- 方案修改前自动读取原文件生成 diff
- 批准后才通过 vscode.workspace.fs 应用修改

#### 项目结构
- `vscode-extension/` — VS Code / Trae 扩展(宿主 + Webview)
- `api/` — Web 应用后端(Express + WebSocket)
- `src/` — Web 应用前端(React + Vite)
- `shared/` — 共享类型定义
