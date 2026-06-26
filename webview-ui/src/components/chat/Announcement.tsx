import { VSCodeButton, VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { CSSProperties, memo } from "react"
import { getAsVar, VSC_DESCRIPTION_FOREGROUND, VSC_INACTIVE_SELECTION_BACKGROUND } from "@/utils/vscStyles"
import { Accordion, AccordionItem } from "@heroui/react"

interface AnnouncementProps {
	version: string
	hideAnnouncement: () => void
}

const containerStyle: CSSProperties = {
	backgroundColor: getAsVar(VSC_INACTIVE_SELECTION_BACKGROUND),
	borderRadius: "3px",
	padding: "12px 16px",
	margin: "5px 15px 5px 15px",
	position: "relative",
	flexShrink: 0,
}
const closeIconStyle: CSSProperties = { position: "absolute", top: "8px", right: "8px" }
const h3TitleStyle: CSSProperties = { margin: "0 0 8px" }
const ulStyle: CSSProperties = { margin: "0 0 8px", paddingLeft: "12px" }
const accountIconStyle: CSSProperties = { fontSize: 11 }
const hrStyle: CSSProperties = {
	height: "1px",
	background: getAsVar(VSC_DESCRIPTION_FOREGROUND),
	opacity: 0.1,
	margin: "8px 0",
}
const linkContainerStyle: CSSProperties = { margin: "0" }
const linkStyle: CSSProperties = { display: "inline" }

/*
You must update the latestAnnouncementId in ClineProvider for new announcements to show to users. This new id will be compared with what's in state for the 'last announcement shown', and if it's different then the announcement will render. As soon as an announcement is shown, the id will be updated in state. This ensures that announcements are not shown more than once, even if the user doesn't close it themselves.
*/
const Announcement = ({ version, hideAnnouncement }: AnnouncementProps) => {
	const minorVersion = version.split(".").slice(0, 2).join(".") // 2.0.0 -> 2.0
	return (
		<div style={containerStyle}>
			<VSCodeButton data-testid="close-button" appearance="icon" onClick={hideAnnouncement} style={closeIconStyle}>
				<span className="codicon codicon-close"></span>
			</VSCodeButton>
			<h3 style={h3TitleStyle}>
				🎉{"  "}v{minorVersion}
			</h3>
			<ul style={ulStyle}>
				<li>
					<b>Claude 4 优化：</b> Cline 现已针对 Claude 4 系列模型进行优化，提升了性能、可靠性，并新增了多项能力。
				</li>
				<li>
					<b>Gemini CLI 提供商：</b> 新增 Gemini CLI 提供商，允许您使用本地 Gemini CLI 认证免费访问 Gemini 模型。
				</li>
				<li>
					<b>WebFetch 工具：</b> Gemini 2.5 Pro 和 Claude 4 模型现支持 WebFetch 工具，允许 Cline 在对话中直接获取和总结网页内容。
				</li>
				<li>
					<b>自我认知：</b> 使用前沿模型时，Cline 能够自我认知其能力和功能集。
				</li>
				<li>
					<b>改进的差异编辑：</b> 改进了差异编辑，在前沿模型上实现了创纪录的低差异编辑失败率。
				</li>
			</ul>
			<Accordion isCompact className="pl-0">
				<AccordionItem
					key="1"
					aria-label="历史更新"
					title="历史更新："
					classNames={{
						trigger: "bg-transparent border-0 pl-0 pb-0 w-fit",
						title: "font-bold text-[var(--vscode-foreground)]",
						indicator:
							"text-[var(--vscode-foreground)] mb-0.5 -rotate-180 data-[open=true]:-rotate-90 rtl:rotate-0 rtl:data-[open=true]:-rotate-90",
					}}>
					<ul style={ulStyle}>
						<li>
							<b>Claude 4 模型：</b> 现已在 Anthropic 和 Vertex 提供商中支持 Anthropic Claude Sonnet 4 和 Claude Opus 4。
							
						</li>
						<li>
							<b>新设置页面：</b> 重新设计的设置页面，现拆分为选项卡，便于导航和更清爽的体验。
							
						</li>
						<li>
							<b>Nebius AI Studio：</b> 新增 Nebius AI Studio 作为新提供商。（感谢 @Aktsvigun！）
						</li>
						<li>
							<b>工作流：</b> 创建和管理工作流文件，可通过斜杠命令注入对话，轻松自动化重复任务。
							
						</li>
						<li>
							<b>可折叠任务列表：</b> 共享屏幕时隐藏最近的任务，保护您的提示隐私。
							
						</li>
						<li>
							<b>Vertex AI 全局端点：</b> 改善了 Vertex AI 用户的可用性，减少了速率限制错误。
							
						</li>
					</ul>
				</AccordionItem>
			</Accordion>
			<div style={hrStyle} />
			<p style={linkContainerStyle}>
				在{" "}
				<VSCodeLink style={linkStyle} href="https://x.com/cline">
					X、
				</VSCodeLink>{" "}
				<VSCodeLink style={linkStyle} href="https://discord.gg/cline">
					Discord、
				</VSCodeLink>{" "}
				或{" "}
				<VSCodeLink style={linkStyle} href="https://www.reddit.com/r/cline/">
					r/cline
				</VSCodeLink>
				上关注我们，获取更多更新！
			</p>
		</div>
	)
}

export default memo(Announcement)
