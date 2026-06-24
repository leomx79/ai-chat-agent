# AI 圆桌讨论 (AI Roundtable)

> 多个 AI 围绕你的项目进行圆桌讨论,自主浏览项目文件,讨论后生成修改方案

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.80+-blue.svg)](https://code.visualstudio.com/)
[![Trae](https://img.shields.io/badge/Trae-compatible-purple.svg)](https://trae.cn/)

## 简介

AI 圆桌讨论是一个 VS Code / Trae 扩展,让多个 AI 角色(架构师、代码审查员、实现工程师等)围绕你的项目进行深度讨论。AI 会自主使用工具浏览项目文件,理解代码结构,然后从各自的专业角度提出方案、互相质疑、达成共识,最终生成可审查的修改方案。

### 核心特性

- **多 AI 并行讨论** — 所有 AI 同时熟悉项目、对齐认知、提案互评,互不打断
- **自主工具调用** — AI 使用 `list_files`、`read_file`、`search_files` 等工具自主探索项目
- **两种讨论模式**:
  - **闭门圆桌会议** — AI 自主完成五阶段讨论(项目熟悉 → 认知对齐 → 提案互评 → 共识 → 方案)
  - **自由对话** — 你与多个 AI 像群聊一样实时对话,随时生成方案
- **Copilot Chat 风格 UI** — Markdown 渲染、工具调用卡片、流式光标、智能滚动
- **内联工具审批** — 危险操作(写文件、执行命令)在聊天流中内联确认,不弹原生对话框
- **方案 diff 审查** — 修改方案以 diff 形式展示,可逐文件审查、批准或拒绝
- **DeepSeek 适配** — 支持 `deepseek-reasoner` 的 `reasoning_content` 传回
- **安全存储** — API Key 存储在 VS Code SecretStorage(加密)

## 截图

*(扩展运行在 VS Code / Trae 侧边栏中)*

## 快速开始

### 安装

1. 下载 [最新 VSIX 文件](https://github.com/leomx79/ai-chat-agent/releases)
2. 在 VS Code / Trae 中按 `Ctrl+Shift+P`,输入 `Extensions: Install from VSIX`
3. 选择下载的 `.vsix` 文件
4. 重新加载窗口

### 配置

1. 点击左侧活动栏的 **AI 圆桌讨论** 图标
2. 进入 **API** 标签 → 填入 DeepSeek API Key → 点 WiFi 图标测试连通性 → 点刷新拉取模型
3. 进入 **AI** 标签 → 选择角色预设(架构师/审查员/实现工程师等) → 绑定提供商和模型 → 保存
4. 进入 **讨论** 标签 → 点 + 号 → 选模式 → 选参与 AI → 发起讨论

### 使用

**闭门圆桌模式:**
1. 创建讨论时选择"闭门圆桌会议"
2. AI 会自动执行五阶段流程,你只需等待
3. 讨论完成后审查方案,批准后自动应用修改

**自由对话模式:**
1. 创建讨论时选择"自由对话"
2. 在输入框发送消息,所有 AI 会同时回复
3. 随时点击"生成方案"按钮,基于对话内容生成修改方案

## 角色预设

| 角色 | 颜色 | 专长 |
|------|------|------|
| 架构师 | 紫色 | 整体结构、设计模式、可维护性 |
| 代码审查员 | 粉色 | 代码质量、边界条件、安全风险 |
| 实现工程师 | 橙色 | 可行性、实现细节、具体代码 |
| 产品顾问 | 绿色 | 用户体验、需求合理性、优先级 |
| 性能优化师 | 青色 | 性能、资源消耗、效率 |
| 测试工程师 | 紫罗兰 | 测试覆盖、异常场景、回归风险 |

## AI 工具系统

AI 在讨论过程中可自主使用以下工具:

| 工具 | 说明 | 需要确认 |
|------|------|----------|
| `list_files` | 列出目录内容 | 否 |
| `read_file` | 读取文件完整内容 | 否 |
| `search_files` | glob 搜索文件名或 grep 搜索内容 | 否 |
| `write_file` | 写入文件 | **是** |
| `execute_command` | 执行终端命令 | **是** |

## 项目结构

```
ai-chat-agent/
├── vscode-extension/          # VS Code / Trae 扩展
│   ├── src/                   # 扩展宿主 (Node.js)
│   │   ├── extension.ts       # 入点,注册命令和 webview
│   │   ├── provider.ts        # Webview 管理
│   │   ├── messageHandler.ts  # 消息路由 + 讨论引擎
│   │   ├── tools.ts           # 工具定义和执行
│   │   ├── llm.ts             # LLM 适配层 (流式 + function calling)
│   │   └── store.ts           # 状态存储
│   ├── webview-ui/            # React 前端 (侧边栏)
│   │   └── src/
│   │       ├── App.tsx        # 主组件
│   │       ├── store.ts       # Zustand 状态管理
│   │       └── views/         # 视图组件
│   └── package.json           # 扩展声明
├── api/                       # Web 应用后端 (Express)
├── src/                       # Web 应用前端 (React)
├── shared/                    # 共享类型定义
└── package.json
```

## 开发

### 环境要求

- Node.js 18+
- npm 或 pnpm

### 构建

```bash
# 安装依赖
npm install
cd vscode-extension && npm install
cd webview-ui && npm install

# 构建 webview
cd vscode-extension/webview-ui
npm run build

# 构建扩展
cd ..
npm run package

# 打包 VSIX
npx vsce package --no-dependencies --allow-missing-repository
```

### 调试

在 `vscode-extension` 目录下用 VS Code 打开,按 `F5` 启动扩展开发宿主。

## 技术栈

- **扩展宿主**: TypeScript, VS Code Extension API, esbuild
- **Webview UI**: React, Zustand, Vite, react-markdown
- **LLM**: OpenAI 兼容协议 (DeepSeek), function calling, 流式 SSE
- **状态**: VS Code globalState + SecretStorage

## 支持的 LLM 提供商

- [DeepSeek](https://api.deepseek.com) (deepseek-chat, deepseek-reasoner)
- 任何 OpenAI 兼容 API (需手动配置 baseUrl)

## 许可证

[MIT](LICENSE)

## 更新日志

详见 [CHANGELOG.md](CHANGELOG.md)

## 路线图

- [ ] 支持更多 LLM 提供商 (OpenAI, Anthropic, Google)
- [ ] 文件引用 (@file) 功能
- [ ] 斜杠命令 (/explain, /fix, /tests)
- [ ] Follow-up 建议芯片
- [ ] 对话分支与重新生成
- [ ] 多工作区支持
- [ ] 讨论模板
