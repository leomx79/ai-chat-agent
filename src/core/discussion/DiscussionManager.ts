import * as vscode from "vscode"
import pWaitFor from "p-wait-for"
import { v4 as uuidv4 } from "uuid"
import { Task } from "@core/task/index"
import { ApiConfiguration, ApiProvider } from "@shared/api"
import { AutoApprovalSettings, DEFAULT_AUTO_APPROVAL_SETTINGS } from "@shared/AutoApprovalSettings"
import { BrowserSettings, DEFAULT_BROWSER_SETTINGS } from "@shared/BrowserSettings"
import { ChatSettings, DEFAULT_CHAT_SETTINGS } from "@shared/ChatSettings"
import { ExtensionMessage } from "@shared/ExtensionMessage"
import { HistoryItem } from "@shared/HistoryItem"
import { ClineAskResponse } from "@shared/WebviewMessage"
import WorkspaceTracker from "@integrations/workspace/WorkspaceTracker"
import { McpHub } from "@services/mcp/McpHub"
import type {
	DiscussionConfig,
	DiscussionMessage,
	DiscussionMessageType,
	DiscussionParticipant,
	DiscussionPhase,
	DiscussionState,
	DiscussionStatus,
	DiscussionStreamItem,
} from "@shared/discussion-types"

// ============================================================================
// Role Presets
// ============================================================================

/**
 * A role preset bundles a display name, a color, and a role prompt that is
 * appended to the base system prompt to steer the AI's perspective.
 */
export interface RolePreset {
	name: string
	color: string
	rolePrompt: string
}

/**
 * Six built-in role presets covering common software-engineering perspectives.
 */
export const DISCUSSION_ROLE_PRESETS: Record<string, RolePreset> = {
	architect: {
		name: "架构师",
		color: "#4A90D9",
		rolePrompt: `你是本次讨论中的**架构师**。

你的主要视角是系统设计和架构。你关注:
- 整体结构、模块化和关注点分离
- 长期可维护性和可扩展性
- 技术选择和权衡
- 数据流和组件关系
- 识别架构风险和反模式

当你发言时,基于你观察到的具体文件路径和代码结构来阐述你的观点。多想几步,思考今天的决策如何影响明天的系统。`,
	},

	reviewer: {
		name: "代码审查员",
		color: "#E67E22",
		rolePrompt: `你是本次讨论中的**代码审查员**。

你的主要视角是代码质量和正确性。你关注:
- 逻辑错误、边界条件和差一错误
- 遵循现有代码库的约定和模式
- 错误处理和防御性编程
- 命名、可读性和DRY原则
- 安全漏洞和输入验证

当你发言时,引用具体的行号和代码片段。精确指出什么错了以及为什么,并建议具体的修复方案。`,
	},

	implementer: {
		name: "实现工程师",
		color: "#2ECC71",
		rolePrompt: `你是本次讨论中的**实现工程师**。

你的主要视角是实际实现。你关注:
- 所提方法的可行性和工作量估算
- 具体实现步骤和排序
- 库和框架细节(API、版本特性)
- 与现有代码的集成点
- 构建、打包和部署考量

当你发言时,提出可操作的步骤。偏好小的、可验证的增量而非大的更改。在有用时用真实代码片段进行原型设计。`,
	},

	product: {
		name: "产品顾问",
		color: "#9B59B6",
		rolePrompt: `你是本次讨论中的**产品顾问**。

你的主要视角是用户价值和需求。你关注:
- 该方法是否真正解决了用户的问题
- 范围、优先级和MVP与锦上添花的区别
- 用户体验和交互流程
- 验收标准和完成定义
- 交付时间线的风险

当你发言时,将技术决策与用户影响联系起来。挑战范围蔓延,倡导最简单可行的方案。`,
	},

	performance: {
		name: "性能优化师",
		color: "#E74C3C",
		rolePrompt: `你是本次讨论中的**性能优化师**。

你的主要视角是效率和可扩展性。你关注:
- 时间复杂度和算法瓶颈
- 内存使用、分配和垃圾回收压力
- I/O模式、批处理和缓存机会
- 并发、并行和锁争用
- 基于分析的优化(避免过早优化)

当你发言时,尽可能量化(大O表示法、预期吞吐量)。区分热路径和冷路径。如有可用数据,用基准测试或分析工具验证声明。`,
	},

	tester: {
		name: "测试工程师",
		color: "#1ABC9C",
		rolePrompt: `你是本次讨论中的**测试工程师**。

你的主要视角是可测试性和质量保证。你关注:
- 测试覆盖缺口和未测试的代码路径
- 边界条件、null/空输入和错误状态
- 提议更改的回归风险
- 集成和端到端测试场景
- 测试结果的可重现性和确定性

当你发言时,提出具体的测试用例。识别什么可能出错以及如何尽早发现。倡导能捕获讨论中的bug的测试。`,
	},
}

// ============================================================================
// Phase Prompts
// ============================================================================

/**
 * Prompts that tell the AI what to do in each phase / conversational act.
 */
export const DISCUSSION_PHASE_PROMPTS: Record<
	"familiarize" | "align" | "lead" | "critique" | "revise",
	string
> = {
	familiarize: `## 阶段:熟悉

深入理解项目。使用工具浏览文件。输出你的理解。暂不要提出解决方案。

具体来说:
1. 探索目录结构和关键文件。
2. 识别技术栈、框架和构建系统。
3. 总结相关模块如何工作和交互。
4. 注意任何现有的模式、约定或约束。

以结构化的理解摘要结束你的输出。`,

	align: `## 阶段:对齐

审查其他参与者的理解。识别差距。对齐你的认知。暂不要提出解决方案。

具体来说:
1. 阅读其他参与者在熟悉阶段分享的内容。
2. 指出任何事实错误或缺失的上下文。
3. 从你的角色视角补充互补信息。
4. 在讨论开始前就项目的当前状态达成共识。

将对齐重点放在共同理解上,而不是解决方案上。`,

	lead: `## 阶段:主导(主要推动者)

基于你的角色,推进主线。展示你的思考过程、方向和不确定性。邀请批评。

具体来说:
1. 从你的角色视角提出你的方法。
2. 解释你的推理和关键权衡。
3. 强调你正在做的不确定性或假设。
4. 明确邀请其他参与者批评你的方法。

要具体——引用真实的文件、函数和数据流。`,

	critique: `## 阶段:批评

深入理解主导者的方法。从你的专业角度提问。如需要,用工具验证。

具体来说:
1. 总结主导者的方法以确认理解。
2. 从你的角色视角提出具体的、可操作的批评。
3. 尽可能通过阅读代码或运行命令验证声明。
4. 区分阻塞性问题和次要建议。

要建设性。对于每个批评,提出替代方案或改进建议。`,

	revise: `## 阶段:修订

回应每个批评。接受/拒绝并说明原因。输出修订后的方法。

具体来说:
1. 逐点回应每个批评。
2. 对于接受的批评,解释你将如何整合反馈。
3. 对于拒绝的批评,提供清晰的理由。
4. 输出包含已接受更改的完整修订方法。

修订后的方法应准备好进入下一轮或达成共识。`,
}

// ============================================================================
// DiscussionManager
// ============================================================================

/**
 * Manages a multi-AI discussion by orchestrating multiple Cline {@link Task}
 * instances — one per AI participant — through a series of discussion phases.
 *
 * The manager creates each participant's Task with a custom API handler (built
 * from the participant's `apiConfiguration`), a modified system prompt (base
 * `SYSTEM_PROMPT` + role prompt + phase prompt), and callbacks that tag
 * messages with participant metadata before forwarding them to the webview.
 */
export class DiscussionManager {
	// ---- Core dependencies (shared across all participant tasks) ----
	private context: vscode.ExtensionContext
	private mcpHub: McpHub
	private workspaceTracker: WorkspaceTracker

	// ---- Controller callbacks ----
	private onStateUpdate: (state: DiscussionState) => void
	private onStreamItem: (item: DiscussionStreamItem) => void
	private onError: (error: string) => void

	// ---- Discussion state ----
	private state: DiscussionState
	private messages: DiscussionMessage[]
	private currentRound: number

	// ---- Active participant tasks ----
	private tasks: Map<string, Task>

	// ---- Abort flag ----
	private aborted: boolean

	/**
	 * @param context          VS Code extension context.
	 * @param mcpHub           MCP hub shared by all participants.
	 * @param workspaceTracker Workspace tracker shared by all participants.
	 * @param onStateUpdate    Callback to push discussion state updates to the webview.
	 * @param onStreamItem     Callback to push stream items (messages, tools) to the webview.
	 * @param onError          Callback to push error messages to the webview.
	 */
	constructor(
		context: vscode.ExtensionContext,
		mcpHub: McpHub,
		workspaceTracker: WorkspaceTracker,
		onStateUpdate: (state: DiscussionState) => void,
		onStreamItem: (item: DiscussionStreamItem) => void,
		onError: (error: string) => void,
	) {
		this.context = context
		this.mcpHub = mcpHub
		this.workspaceTracker = workspaceTracker
		this.onStateUpdate = onStateUpdate
		this.onStreamItem = onStreamItem
		this.onError = onError

		this.tasks = new Map()
		this.aborted = false
		this.currentRound = 0
		this.messages = []

		this.state = {
			id: Date.now().toString(),
			config: {
				topic: "",
				mode: "roundtable",
				maxRounds: 3,
				participants: [],
			},
			phase: "familiarize",
			status: "idle",
			currentRound: 0,
			currentPhase: null,
			streamingParticipantIds: [],
		}
	}

	// ------------------------------------------------------------------------
	// Helpers
	// ------------------------------------------------------------------------

	private notifyStateUpdate() {
		this.onStateUpdate({ ...this.state })
	}

	private emitMessageStreamItem(msg: DiscussionMessage) {
		const item: DiscussionStreamItem = {
			id: uuidv4(),
			kind: "message",
			msg,
			participantId: msg.participantId,
			participantName: msg.participantName,
		}
		this.onStreamItem(item)
	}

	// ------------------------------------------------------------------------
	// Public API
	// ------------------------------------------------------------------------

	/**
	 * Initialise the discussion and run the familiarize phase.
	 *
	 * All participants explore the codebase in parallel and share their
	 * understanding. No solutions are proposed at this stage.
	 *
	 * @param config The discussion configuration.
	 */
	async start(config: DiscussionConfig): Promise<void> {
		this.state.config = config
		this.state.status = "discussing"
		this.state.phase = "familiarize"
		this.messages = []
		this.currentRound = 0
		this.aborted = false

		this.addSystemMessage(`讨论已开始。主题:${config.topic}。模式:${config.mode}。参与者:${config.participants.map((p) => p.name).join(", ")}。`)

		await this.notifyStateUpdate()

		if (config.mode === "roundtable") {
			await this.runPhase("familiarize")
			await this.runPhase("align")
		}
	}

	/**
	 * Execute a discussion phase.
	 *
	 * - `familiarize` and `align` run all participants **in parallel**.
	 * - `discuss` runs **sequentially**: lead → critique → revise for each
	 *   round, using the participants in order as the lead.
	 *
	 * @param phase The phase to execute.
	 */
	async runPhase(phase: DiscussionPhase): Promise<void> {
		if (this.aborted) {
			return
		}

		this.state.phase = phase
		await this.notifyStateUpdate()

		const { config } = this.state

		switch (phase) {
			case "familiarize":
			case "align": {
				// Parallel execution — each participant works independently.
				const messageType: DiscussionMessageType = phase
				const phasePromptKey = phase as "familiarize" | "align"
				const phasePrompt = DISCUSSION_PHASE_PROMPTS[phasePromptKey]

				const promises = config.participants.map((participant) =>
					this.runParticipantTask(participant, phase, messageType, phasePrompt, this.buildContextForParticipant(participant, phase)),
				)

				await Promise.all(promises)
				break
			}

			case "discuss": {
				// Sequential execution — lead → critique → revise for each round.
				for (this.currentRound = 1; this.currentRound <= config.maxRounds; this.currentRound++) {
					if (this.aborted) {
						break
					}

					this.state.currentRound = this.currentRound
					this.addSystemMessage(`--- 第 ${this.currentRound} 轮,共 ${config.maxRounds} 轮 ---`)

					for (const leadParticipant of config.participants) {
						if (this.aborted) {
							break
						}

						// 1. Lead
						await this.runParticipantTask(
							leadParticipant,
							phase,
							"lead",
							DISCUSSION_PHASE_PROMPTS.lead,
							this.buildContextForParticipant(leadParticipant, phase),
						)

						if (this.aborted) {
							break
						}

						// 2. Critique (all other participants, in parallel)
						const critics = config.participants.filter((p) => p.id !== leadParticipant.id)
						const critiquePromises = critics.map((critic) =>
							this.runParticipantTask(
								critic,
								phase,
								"critique",
								DISCUSSION_PHASE_PROMPTS.critique,
								this.buildContextForParticipant(critic, phase),
							),
						)
						await Promise.all(critiquePromises)

						if (this.aborted) {
							break
						}

						// 3. Revise (lead responds to critiques)
						await this.runParticipantTask(
							leadParticipant,
							phase,
							"revise",
							DISCUSSION_PHASE_PROMPTS.revise,
							this.buildContextForParticipant(leadParticipant, phase),
						)
					}
				}

				if (!this.aborted) {
					this.state.status = "consensus"
					this.addSystemMessage("讨论轮次已完成。准备生成方案。")
				}
				break
			}

			case "converge": {
				// All participants summarise their final position in parallel.
				const convergePrompt = `## 阶段:共识

综合讨论。陈述你对方法的最终立场。
1. 总结关键共识点。
2. 总结关键分歧点。
3. 陈述你推荐的方法及原因。`

				const promises = config.participants.map((participant) =>
					this.runParticipantTask(participant, phase, "lead", convergePrompt, this.buildContextForParticipant(participant, phase)),
				)
				await Promise.all(promises)
				break
			}

			case "propose": {
				await this.generateProposal()
				break
			}
		}

		this.state.currentPhase = null
		await this.notifyStateUpdate()
	}

	/**
	 * Handle a user chat message in "chat" mode.
	 *
	 * The user message is recorded, then all participants respond in parallel.
	 *
	 * @param text The user's message text.
	 */
	async handleChatMessage(text: string): Promise<void> {
		if (this.aborted) {
			return
		}

		// Record the user message
		this.messages.push({
			id: crypto.randomUUID(),
			participantId: "user",
			participantName: "用户",
			type: "user",
			content: text,
			phase: this.state.phase,
			timestamp: Date.now(),
		})

		await this.notifyStateUpdate()

		// All participants respond in parallel
		const chatPrompt = `## 聊天模式

用户发送了以下消息。从你的角色视角回复。

用户消息:
${text}

自然地与用户和彼此互动。你可以使用工具来验证你的声明。`

		const promises = this.state.config.participants.map((participant) =>
			this.runParticipantTask(participant, this.state.phase, "lead", chatPrompt, text),
		)

		await Promise.all(promises)
	}

	/**
	 * Collect the consensus from all participants and generate a file
	 * modification proposal.
	 *
	 * The first participant (or a designated lead) is tasked with producing
	 * the proposal, given all discussion messages as context.
	 *
	 * @returns The generated proposal text.
	 */
	async generateProposal(): Promise<string> {
		if (this.aborted) {
			return ""
		}

		this.state.status = "proposing"
		this.state.phase = "propose"
		await this.notifyStateUpdate()

		const consensus = this.messages
			.filter((m) => m.type !== "system" && m.type !== "user")
			.map((m) => `[${m.participantName} (${m.type})]: ${m.content}`)
			.join("\n\n---\n\n")

		const proposalPrompt = `## 阶段:方案生成

基于整个讨论,生成一个具体的文件修改方案。

讨论记录:
${consensus}

你的方案应包括:
1. 已达成共识的方法摘要。
2. 对于每个要修改的文件:文件路径、更改性质以及简短的代码片段或diff描述。
3. 任何剩余的待办事项或风险。

以清晰、结构化的格式输出方案。`

		const leadParticipant = this.state.config.participants[0]
		if (!leadParticipant) {
			this.addSystemMessage("没有可用的参与者来生成方案。")
			return ""
		}

		await this.runParticipantTask(leadParticipant, "propose", "lead", proposalPrompt, consensus)

		// Return the last non-system message as the proposal
		const proposalMessage = [...this.messages]
			.reverse()
			.find((m) => m.participantId === leadParticipant.id && m.type === "lead")

		const proposalText = proposalMessage?.content ?? ""

		this.state.proposal = {
			summary: proposalText,
			changes: [],
		}
		this.state.status = "reviewing"
		this.state.currentPhase = null
		this.addSystemMessage("方案已生成。等待审查。")
		await this.notifyStateUpdate()

		return proposalText
	}

	/**
	 * Abort all active participant tasks and mark the discussion as done.
	 */
	async abort(): Promise<void> {
		this.aborted = true
		this.state.status = "done"

		for (const [, task] of this.tasks) {
			task.taskState.abort = true
			// Auto-respond to any pending ask so the task loop unblocks
			if (task.taskState.askResponse === undefined) {
				task.handleWebviewAskResponse("noButtonClicked" as ClineAskResponse)
			}
		}

		this.tasks.clear()
		this.addSystemMessage("讨论已中止。")
		await this.notifyStateUpdate()
	}

	/**
	 * Return all discussion messages accumulated so far.
	 *
	 * @returns A copy of the messages array.
	 */
	getMessages(): DiscussionMessage[] {
		return [...this.messages]
	}

	/**
	 * Return the current discussion state.
	 *
	 * @returns A shallow copy of the state.
	 */
	getState(): DiscussionState {
		return { ...this.state }
	}

	// ------------------------------------------------------------------------
	// Task Management
	// ------------------------------------------------------------------------

	/**
	 * Run a single participant's Task for one conversational turn.
	 *
	 * Creates a Cline {@link Task} with the participant's API configuration,
	 * a modified system prompt (base + role + phase), and wrapped callbacks
	 * that tag output as {@link DiscussionMessage}s. Waits for the task to
	 * reach `completion_result` (or abort), then collects its text output.
	 *
	 * @param participant   The participant configuration.
	 * @param phase         The current discussion phase.
	 * @param messageType   The discussion message type to tag outputs with.
	 * @param phasePrompt   The phase-specific prompt text.
	 * @param extraContext  Additional context (e.g. other participants' output).
	 */
	private async runParticipantTask(
		participant: DiscussionParticipant,
		phase: DiscussionPhase,
		messageType: DiscussionMessageType,
		phasePrompt: string,
		extraContext: string,
	): Promise<void> {
		if (this.aborted) {
			return
		}

		// Build the task prompt: role prompt + phase prompt + topic + context
		const taskPrompt = this.buildParticipantPrompt(participant, phasePrompt, extraContext)

		// Track the last processed message timestamp for this run
		let lastProcessedTs = 0

		// Wrapped postStateToWebview — collects new text messages, then
		// delegates to the controller so the real webview stays in sync.
		const wrappedPostStateToWebview = async (): Promise<void> => {
			const task = this.tasks.get(participant.id)
			if (task) {
				this.collectNewTextMessages(task, participant, phase, messageType, lastProcessedTs, (newTs) => {
					lastProcessedTs = newTs
				})
			}
			await this.notifyStateUpdate()
		}

		// Wrapped postMessageToWebview — intercept text messages, wrap as
		// DiscussionMessage, then emit as stream items.
		const wrappedPostMessageToWebview = async (message: ExtensionMessage): Promise<void> => {
			// Intercept "state" messages that contain clineMessages with text
			if (message.type === "state" && message.state?.clineMessages) {
				const task = this.tasks.get(participant.id)
				if (task) {
					this.collectNewTextMessages(task, participant, phase, messageType, lastProcessedTs, (newTs) => {
						lastProcessedTs = newTs
					})
				}
			}

			// Discussion tasks don't forward raw messages to the webview;
			// stream items are emitted via onStreamItem instead.
		}

		// Create the Task via the factory
		const task = this.createParticipantTask(
			participant,
			taskPrompt,
			wrappedPostStateToWebview,
			wrappedPostMessageToWebview,
		)

		this.tasks.set(participant.id, task)
		this.state.streamingParticipantIds.push(participant.id)
		this.notifyStateUpdate()

		// Wait for the task to complete (or abort / timeout)
		await this.waitForTaskCompletion(task)

		// Collect any remaining text messages that weren't captured by the
		// callback (e.g. the final completion_result text).
		const clineMessages = task.messageStateHandler.getClineMessages()
		for (const clineMsg of clineMessages) {
			if (
				clineMsg.ts > lastProcessedTs &&
				clineMsg.type === "say" &&
				clineMsg.say === "text" &&
				!clineMsg.partial &&
				clineMsg.text
			) {
				this.addDiscussionMessage(participant, messageType, phase, clineMsg.text)
			}
		}

		// Clean up: abort the task and remove it from the active map
		task.taskState.abort = true
		if (task.taskState.askResponse === undefined) {
			task.handleWebviewAskResponse("noButtonClicked" as ClineAskResponse)
		}
		this.tasks.delete(participant.id)
		this.state.streamingParticipantIds = this.state.streamingParticipantIds.filter(
			(id) => id !== participant.id,
		)
		this.notifyStateUpdate()
	}

	/**
	 * Factory method that creates a Cline {@link Task} for a discussion
	 * participant, providing sensible defaults for the many constructor
	 * parameters.
	 *
	 * @param participant           The participant configuration (contains API config).
	 * @param taskPrompt            The initial task text (role + phase + topic + context).
	 * @param postStateToWebview    Wrapped callback for state updates.
	 * @param postMessageToWebview  Wrapped callback for specific messages.
	 * @returns A new Task instance configured for this participant.
	 */
	private createParticipantTask(
		participant: DiscussionParticipant,
		taskPrompt: string,
		postStateToWebview: () => Promise<void>,
		postMessageToWebview: (message: ExtensionMessage) => Promise<void>,
	): Task {
		// --- Callbacks with sensible defaults ---

		/** No-op history update — discussion tasks are ephemeral. */
		const updateTaskHistory = async (_historyItem: HistoryItem): Promise<HistoryItem[]> => {
			return []
		}

		/** No-op reinit — discussion tasks are not resumed from history. */
		const reinitExistingTaskFromId = async (_taskId: string): Promise<void> => {
			/* no-op */
		}

		/** Cancel callback — aborts the discussion. */
		const cancelTask = async (): Promise<void> => {
			await this.abort()
		}

		// --- Settings with sensible defaults ---

		const autoApprovalSettings: AutoApprovalSettings = {
			...DEFAULT_AUTO_APPROVAL_SETTINGS,
			// Allow file reads so participants can explore the codebase
			actions: {
				...DEFAULT_AUTO_APPROVAL_SETTINGS.actions,
				readFiles: true,
				readFilesExternally: false,
				executeSafeCommands: true,
			},
		}

		const browserSettings: BrowserSettings = { ...DEFAULT_BROWSER_SETTINGS }

		const chatSettings: ChatSettings = {
			...DEFAULT_CHAT_SETTINGS,
			mode: "act", // discussion participants act autonomously
		}

		// --- Create the Task ---

		return new Task(
			this.context, // 1. context
			this.mcpHub, // 2. mcpHub
			this.workspaceTracker, // 3. workspaceTracker
			updateTaskHistory, // 4. updateTaskHistory
			postStateToWebview, // 5. postStateToWebview
			postMessageToWebview, // 6. postMessageToWebview
			reinitExistingTaskFromId, // 7. reinitExistingTaskFromId
			cancelTask, // 8. cancelTask
			this.buildApiConfiguration(participant), // 9. apiConfiguration
			autoApprovalSettings, // 10. autoApprovalSettings
			browserSettings, // 11. browserSettings
			chatSettings, // 12. chatSettings
			2_000, // 13. shellIntegrationTimeout
			true, // 14. terminalReuseEnabled
			500, // 15. terminalOutputLineLimit
			"default", // 16. defaultTerminalProfile
			false, // 17. enableCheckpointsSetting (disable for ephemeral tasks)
			taskPrompt, // 18. task
			undefined, // 19. images
			undefined, // 20. files
			undefined, // 21. historyItem
		)
	}

	// ------------------------------------------------------------------------
	// Task Completion & Message Collection
	// ------------------------------------------------------------------------

	/**
	 * Wait for a participant Task to reach a terminal state.
	 *
	 * Polls until the task is aborted, the last cline message is a
	 * `completion_result` ask, or the timeout expires. When a
	 * `completion_result` is detected it is auto-approved so the task
	 * loop can exit cleanly.
	 *
	 * @param task       The Task to wait on.
	 * @param timeoutMs  Maximum time to wait (default 5 min).
	 */
	private async waitForTaskCompletion(task: Task, timeoutMs: number = 300_000): Promise<void> {
		const checkInterval = 500

		try {
			await pWaitFor(
				() => {
					if (this.aborted || task.taskState.abort) {
						return true
					}

					const messages = task.messageStateHandler.getClineMessages()
					const lastMessage = messages.at(-1)

					// The task has produced a completion_result and is waiting
					// for user feedback — treat this as "done".
					if (lastMessage?.ask === "completion_result") {
						return true
					}

					return false
				},
				{ timeout: timeoutMs, interval: checkInterval },
			)
		} catch (error) {
			// Timeout — the task will be aborted by the caller
			console.warn(`[DiscussionManager] Task ${task.taskId} timed out after ${timeoutMs}ms`)
		}

		// Auto-approve the completion so the task loop unblocks
		const messages = task.messageStateHandler.getClineMessages()
		const lastMessage = messages.at(-1)
		if (lastMessage?.ask === "completion_result" && !task.taskState.abort) {
			task.handleWebviewAskResponse("yesButtonClicked" as ClineAskResponse)

			// Give the task a brief moment to process the approval
			await new Promise((resolve) => setTimeout(resolve, 1_000))
		}
	}

	/**
	 * Scan a Task's clineMessages for new (unseen) text messages and add
	 * them to the discussion as {@link DiscussionMessage}s.
	 *
	 * @param task           The participant's Task.
	 * @param participant    The participant configuration.
	 * @param phase          The current discussion phase.
	 * @param messageType    The discussion message type to tag.
	 * @param sinceTs        Only collect messages with ts > this value.
	 * @param updateTs       Callback to update the caller's lastProcessedTs.
	 */
	private collectNewTextMessages(
		task: Task,
		participant: DiscussionParticipant,
		phase: DiscussionPhase,
		messageType: DiscussionMessageType,
		sinceTs: number,
		updateTs: (ts: number) => void,
	): void {
		const clineMessages = task.messageStateHandler.getClineMessages()
		let maxTs = sinceTs

		for (const clineMsg of clineMessages) {
			if (
				clineMsg.ts > sinceTs &&
				clineMsg.type === "say" &&
				clineMsg.say === "text" &&
				!clineMsg.partial &&
				clineMsg.text
			) {
				this.addDiscussionMessage(participant, messageType, phase, clineMsg.text)

				if (clineMsg.ts > maxTs) {
					maxTs = clineMsg.ts
				}
			}
		}

		if (maxTs > sinceTs) {
			updateTs(maxTs)
		}
	}

	// ------------------------------------------------------------------------
	// Prompt Building
	// ------------------------------------------------------------------------

	/**
	 * Build the task prompt for a participant.
	 *
	 * The prompt combines:
	 * 1. The role prompt (from the preset or the participant's override).
	 * 2. The phase prompt (what the AI should do in this phase).
	 * 3. The discussion topic.
	 * 4. Extra context (e.g. other participants' output).
	 *
	 * The Task class builds the base `SYSTEM_PROMPT` internally, so the
	 * role and phase prompts are delivered via the task text. This
	 * effectively gives the AI: base system prompt + role prompt + phase
	 * prompt.
	 *
	 * @param participant   The participant.
	 * @param phasePrompt   The phase-specific prompt.
	 * @param extraContext  Additional context string.
	 * @returns The complete task prompt.
	 */
	private buildParticipantPrompt(
		participant: DiscussionParticipant,
		phasePrompt: string,
		extraContext: string,
	): string {
		const rolePreset = DISCUSSION_ROLE_PRESETS[participant.role]
		const rolePrompt = rolePreset?.rolePrompt ?? ""

		const parts: string[] = []

		// Role prompt
		if (rolePrompt) {
			parts.push(rolePrompt)
		}

		// Phase prompt
		parts.push(phasePrompt)

		// Discussion topic
		parts.push(`## 讨论主题\n\n${this.state.config.topic}`)

		// Extra context (other participants' output, user message, etc.)
		if (extraContext) {
			parts.push(`## 上下文\n\n${extraContext}`)
		}

		// Instruction to complete and use attempt_completion
		parts.push(`## 指令\n\n当你完成此阶段的回复后,使用 attempt_completion 工具展示你的输出。你的完成结果应仅包含你在此阶段的回复。`)

		return parts.join("\n\n====\n\n")
	}

	/**
	 * Build context from other participants' messages for a given phase.
	 *
	 * In the `align` and `discuss` phases, participants need to see what
	 * others have said. This method collects prior messages relevant to
	 * the current phase.
	 *
	 * @param participant  The participant who will receive this context.
	 * @param phase        The current phase.
	 * @returns Formatted context string.
	 */
	private buildContextForParticipant(participant: DiscussionParticipant, phase: DiscussionPhase): string {
		// For familiarize, there is no prior context
		if (phase === "familiarize") {
			return ""
		}

		// For align and discuss, include messages from other participants
		const priorMessages = this.messages.filter(
			(m) => m.participantId !== participant.id && m.type !== "system" && m.type !== "user",
		)

		if (priorMessages.length === 0) {
			return ""
		}

		return priorMessages
			.map((m) => `### ${m.participantName} (${m.type}, 阶段: ${m.phase})\n\n${m.content}`)
			.join("\n\n---\n\n")
	}

	// ------------------------------------------------------------------------
	// Message Helpers
	// ------------------------------------------------------------------------

	/**
	 * Add a discussion message from a participant.
	 */
	private addDiscussionMessage(
		participant: DiscussionParticipant,
		type: DiscussionMessageType,
		phase: DiscussionPhase,
		content: string,
	): void {
		// Avoid duplicate messages (same participant + same timestamp window)
		const existing = this.messages.find(
			(m) =>
				m.participantId === participant.id &&
				m.type === type &&
				m.phase === phase &&
				m.content === content,
		)
		if (existing) {
			return
		}

		const msg: DiscussionMessage = {
			id: uuidv4(),
			participantId: participant.id,
			participantName: participant.name,
			type,
			content,
			phase,
			timestamp: Date.now(),
		}
		this.messages.push(msg)
		this.emitMessageStreamItem(msg)
	}

	/**
	 * Add a system-level message (not attributed to any participant).
	 */
	private addSystemMessage(content: string): void {
		const msg: DiscussionMessage = {
			id: uuidv4(),
			participantId: "system",
			participantName: "系统",
			type: "system",
			content,
			phase: this.state.phase,
			timestamp: Date.now(),
		}
		this.messages.push(msg)
		this.emitMessageStreamItem(msg)
	}

	// ------------------------------------------------------------------------
	// Proposal Application
	// ------------------------------------------------------------------------

	/**
	 * Apply the generated proposal's file changes to the workspace.
	 *
	 * Uses vscode.workspace.fs to create, modify, or delete files relative to
	 * the first workspace folder.
	 */
	async applyProposal(): Promise<void> {
		if (!this.state.proposal) {
			this.onError("没有可应用的方案")
			return
		}

		this.state.status = "reviewing"
		this.notifyStateUpdate()

		const workspaceFolders = vscode.workspace.workspaceFolders
		if (!workspaceFolders) {
			this.onError("没有打开的工作区文件夹")
			return
		}
		const workspaceRoot = workspaceFolders[0].uri

		try {
			for (const change of this.state.proposal.changes) {
				const fileUri = vscode.Uri.joinPath(workspaceRoot, change.filePath)

				switch (change.action) {
					case "create":
					case "modify": {
						if (change.content !== undefined) {
							const contentBytes = Buffer.from(change.content, "utf8")
							await vscode.workspace.fs.writeFile(fileUri, contentBytes)
						}
						break
					}
					case "delete": {
						try {
							await vscode.workspace.fs.delete(fileUri)
						} catch {
							// File may not exist — ignore
						}
						break
					}
				}
			}

			this.state.status = "done"
			this.addSystemMessage("方案已应用到工作区。")
			this.notifyStateUpdate()
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error)
			this.onError(`应用方案失败:${errorMsg}`)
			this.state.status = "rejected"
			this.notifyStateUpdate()
		}
	}

	/**
	 * Reject the generated proposal, setting the discussion status to
	 * "rejected".
	 */
	rejectProposal(): void {
		this.state.status = "rejected"
		this.addSystemMessage("方案已拒绝。")
		this.notifyStateUpdate()
	}

	// ------------------------------------------------------------------------
	// API Configuration
	// ------------------------------------------------------------------------

	/**
	 * Build an {@link ApiConfiguration} from a shared {@link DiscussionParticipant}.
	 *
	 * The shared participant type carries lightweight provider fields
	 * (providerId, modelId, apiKey, baseURL) rather than a full
	 * ApiConfiguration. This helper maps those fields to the correct
	 * ApiConfiguration properties for the given provider.
	 */
	private buildApiConfiguration(participant: DiscussionParticipant): ApiConfiguration {
		const provider = (participant.providerId ?? "openai") as ApiProvider
		const config: ApiConfiguration = {
			apiProvider: provider,
		}

		switch (provider) {
			case "anthropic":
			case "vertex":
			case "gemini":
			case "deepseek":
			case "qwen":
			case "xai":
			case "asksage":
			case "openai-native":
				config.apiKey = participant.apiKey
				config.apiModelId = participant.modelId
				break
			case "openai":
				config.openAiApiKey = participant.apiKey
				config.openAiModelId = participant.modelId
				config.openAiBaseUrl = participant.baseURL
				break
			case "openrouter":
			case "cline":
				config.openRouterApiKey = participant.apiKey
				config.openRouterModelId = participant.modelId
				break
			case "ollama":
				config.ollamaModelId = participant.modelId
				config.ollamaBaseUrl = participant.baseURL
				break
			case "lmstudio":
				config.lmStudioModelId = participant.modelId
				config.lmStudioBaseUrl = participant.baseURL
				break
			case "litellm":
				config.liteLlmApiKey = participant.apiKey
				config.liteLlmModelId = participant.modelId
				config.liteLlmBaseUrl = participant.baseURL
				break
			case "requesty":
				config.requestyApiKey = participant.apiKey
				config.requestyModelId = participant.modelId
				break
			default:
				// Default to OpenAI-compatible configuration
				config.apiProvider = "openai"
				config.openAiApiKey = participant.apiKey
				config.openAiModelId = participant.modelId
				config.openAiBaseUrl = participant.baseURL
				break
		}

		return config
	}
}
