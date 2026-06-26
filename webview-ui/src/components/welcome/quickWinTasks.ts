export interface QuickWinTask {
	id: string
	title: string
	description: string
	icon?: string
	actionCommand: string
	prompt: string
	buttonText?: string
}

export const quickWinTasks: QuickWinTask[] = [
	{
		id: "nextjs_notetaking_app",
		title: "构建 Next.js 应用",
		description: "使用 Next.js 和 Tailwind CSS 创建一个精美的笔记应用。",
		icon: "WebAppIcon",
		actionCommand: "cline/createNextJsApp",
		prompt: "使用 Next.js 制作一个精美的笔记应用，使用 Tailwind CSS 进行样式设计。搭建基本结构和用于添加和查看笔记的简单界面。",
		buttonText: ">",
	},
	{
		id: "terminal_cli_tool",
		title: "制作 CLI 工具",
		description: "开发一个强大的终端 CLI 来自动化一个酷炫的任务。",
		icon: "TerminalIcon",
		actionCommand: "cline/createCliTool",
		prompt: "使用 Node.js 制作一个终端 CLI 工具，通过免费的天气 API 获取指定城市的当前天气，并以用户友好的格式显示。",
		buttonText: ">",
	},
	{
		id: "snake_game",
		title: "开发游戏",
		description: "编写一个在浏览器中运行的经典贪吃蛇游戏。",
		icon: "GameIcon",
		actionCommand: "cline/createSnakeGame",
		prompt: "使用 HTML、CSS 和 JavaScript 制作经典贪吃蛇游戏。游戏应可在浏览器中运行，具有键盘控制、计分系统和游戏结束状态。",
		buttonText: ">",
	},
]
