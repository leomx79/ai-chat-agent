import * as vscode from "vscode"
import pWaitFor from "p-wait-for"
import { v4 as uuidv4 } from "uuid"
import { Task } from "@core/task/index"
import { ApiConfiguration, ApiProvider } from "@shared/api"
import { AutoApprovalSettings, DEFAULT_AUTO_APPROVAL_SETTINGS } from "@shared/AutoApprovalSettings"
import { BrowserSettings, DEFAULT_BROWSER_SETTINGS } from "@shared/BrowserSettings"
import { ChatSettings, DEFAULT_CHAT_SETTINGS } from "@shared/ChatSettings"
import { ExtensionMessage, ClineMessage } from "@shared/ExtensionMessage"
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
		name: "Architect",
		color: "#4A90D9",
		rolePrompt: `You are the **Architect** in this discussion.

Your primary lens is system design and architecture. You focus on:
- Overall structure, modularity, and separation of concerns
- Long-term maintainability and extensibility
- Technology choices and trade-offs
- Data flow and component relationships
- Identifying architectural risks and anti-patterns

When you speak, ground your points in concrete file paths and code structures you have observed. Think several steps ahead about how decisions today affect the system tomorrow.`,
	},

	reviewer: {
		name: "Code Reviewer",
		color: "#E67E22",
		rolePrompt: `You are the **Code Reviewer** in this discussion.

Your primary lens is code quality and correctness. You focus on:
- Logic errors, edge cases, and off-by-one mistakes
- Adherence to existing codebase conventions and patterns
- Error handling and defensive programming
- Naming, readability, and DRY principles
- Security vulnerabilities and input validation

When you speak, cite specific line numbers and code snippets. Be precise about what is wrong and why, and suggest concrete fixes.`,
	},

	implementer: {
		name: "Implementer",
		color: "#2ECC71",
		rolePrompt: `You are the **Implementer** in this discussion.

Your primary lens is practical implementation. You focus on:
- Feasibility and effort estimation of proposed approaches
- Concrete implementation steps and sequencing
- Library and framework specifics (APIs, version quirks)
- Integration points with existing code
- Build, packaging, and deployment considerations

When you speak, propose actionable steps. Prefer small, verifiable increments over large changes. Prototype with real code snippets when useful.`,
	},

	product: {
		name: "Product Manager",
		color: "#9B59B6",
		rolePrompt: `You are the **Product Manager** in this discussion.

Your primary lens is user value and requirements. You focus on:
- Whether the approach actually solves the user's problem
- Scope, priorities, and MVP vs. nice-to-have
- User experience and interaction flows
- Acceptance criteria and definition of done
- Risks to delivery timelines

When you speak, connect technical decisions back to user impact. Challenge scope creep and advocate for the simplest thing that works.`,
	},

	performance: {
		name: "Performance Engineer",
		color: "#E74C3C",
		rolePrompt: `You are the **Performance Engineer** in this discussion.

Your primary lens is efficiency and scalability. You focus on:
- Time complexity and algorithmic bottlenecks
- Memory usage, allocations, and garbage collection pressure
- I/O patterns, batching, and caching opportunities
- Concurrency, parallelism, and lock contention
- Profiling-driven optimisation (avoid premature optimisation)

When you speak, quantify when possible (Big-O, expected throughput). Distinguish between hot paths and cold paths. Validate claims with benchmarks or profiling tools if available.`,
	},

	tester: {
		name: "QA Engineer",
		color: "#1ABC9C",
		rolePrompt: `You are the **QA Engineer** in this discussion.

Your primary lens is testability and quality assurance. You focus on:
- Test coverage gaps and untested code paths
- Boundary conditions, null/empty inputs, and error states
- Regression risks from proposed changes
- Integration and end-to-end test scenarios
- Reproducibility and determinism of test results

When you speak, propose specific test cases. Identify what could break and how to detect it early. Advocate for tests that would catch the bugs being discussed.`,
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
	familiarize: `## Phase: Familiarization

Deeply understand the project. Use tools to browse files. Output your understanding. DO NOT propose solutions yet.

Specifically:
1. Explore the directory structure and key files.
2. Identify the tech stack, frameworks, and build system.
3. Summarise how the relevant modules work and interact.
4. Note any existing patterns, conventions, or constraints.

End your output with a structured summary of your understanding.`,

	align: `## Phase: Alignment

Review other participants' understanding. Identify gaps. Align your认知. DO NOT propose solutions yet.

Specifically:
1. Read what other participants have shared during familiarization.
2. Point out any factual errors or missing context.
3. Add complementary information from your role's perspective.
4. Build consensus on the current state of the project before discussion begins.

Keep your alignment focused on shared understanding, not on solutions.`,

	lead: `## Phase: Lead (Main Pusher)

Based on your role, advance the main line. Show your thinking process, direction, and uncertainties. Invite critique.

Specifically:
1. Propose your approach from your role's perspective.
2. Explain your reasoning and key trade-offs.
3. Highlight uncertainties or assumptions you are making.
4. Explicitly invite other participants to critique your approach.

Be concrete — reference real files, functions, and data flows.`,

	critique: `## Phase: Critique

Deeply understand the lead's approach. Question from your professional angle. Validate with tools if needed.

Specifically:
1. Summarise the lead's approach to confirm understanding.
2. Raise specific, actionable critiques from your role's perspective.
3. Validate claims by reading code or running commands when possible.
4. Distinguish between blocking issues and minor suggestions.

Be constructive. For each critique, suggest an alternative or improvement.`,

	revise: `## Phase: Revise

Respond to each critique. Accept/reject with reasons. Output revised approach.

Specifically:
1. Address every critique point-by-point.
2. For accepted critiques, explain how you will incorporate the feedback.
3. For rejected critiques, provide clear justification.
4. Output the complete revised approach incorporating accepted changes.

The revised approach should be ready for the next round or for convergence.`,
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
	/**
	 * 新增回调：把带 participantId 标记的 ClineMessage 传给 controller，
	 * controller 将其注入主 clineMessages 流，从而复用 ChatView/ChatRow 全套 UI。
	 */
	private onClineMessage: (msg: ClineMessage) => void

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
		onClineMessage: (msg: ClineMessage) => void,
	) {
		this.context = context
		this.mcpHub = mcpHub
		this.workspaceTracker = workspaceTracker
		this.onStateUpdate = onStateUpdate
		this.onStreamItem = onStreamItem
		this.onError = onError
		this.onClineMessage = onClineMessage

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

		this.addSystemMessage(`Discussion started. Topic: ${config.topic}. Mode: ${config.mode}. Participants: ${config.participants.map((p) => p.name).join(", ")}.`)

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
					this.addSystemMessage(`--- Round ${this.currentRound} of ${config.maxRounds} ---`)

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
					this.addSystemMessage("Discussion rounds complete. Ready to generate proposal.")
				}
				break
			}

			case "converge": {
				// All participants summarise their final position in parallel.
				const convergePrompt = `## Phase: Convergence

Synthesise the discussion. State your final position on the approach.
1. Summarise the key points of agreement.
2. Summarise the key points of disagreement.
3. State your recommended approach and why.`

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
			participantName: "User",
			type: "user",
			content: text,
			phase: this.state.phase,
			timestamp: Date.now(),
		})

		await this.notifyStateUpdate()

		// All participants respond in parallel
		const chatPrompt = `## Chat Mode

A user has sent the following message. Respond from your role's perspective.

User message:
${text}

Engage naturally with the user and with each other. You may use tools to verify your claims.`

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

		const proposalPrompt = `## Phase: Proposal Generation

Based on the entire discussion, generate a concrete file modification proposal.

Discussion transcript:
${consensus}

Your proposal should include:
1. A summary of the agreed-upon approach.
2. For each file to be modified: the file path, the nature of the change, and a brief code snippet or diff description.
3. Any open items or risks that remain.

Output the proposal in a clear, structured format.`

		const leadParticipant = this.state.config.participants[0]
		if (!leadParticipant) {
			this.addSystemMessage("No participants available to generate proposal.")
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
		this.addSystemMessage("Proposal generated. Awaiting review.")
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
		this.addSystemMessage("Discussion aborted.")
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
	 * 扫描 Task 的 clineMessages，找出新消息（ts > sinceTs），
	 * 给每条消息打上参与者标记（participantId/Name/Color），
	 * 然后通过 onClineMessage 回调转发到 controller 的主消息流，
	 * 这样 ChatView/ChatRow 就能直接渲染参与者消息（含工具调用、命令等）。
	 *
	 * 同时对 text 消息调用 addDiscussionMessage 维护内部讨论状态。
	 *
	 * @param task           参与者的 Task 实例
	 * @param participant    参与者配置（含 id/name/color）
	 * @param phase          当前讨论阶段
	 * @param messageType    讨论消息类型标签
	 * @param sinceTs        只收集 ts > 此值的消息
	 * @param updateTs       回调，用于更新调用方的 lastProcessedTs
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
			if (clineMsg.ts > sinceTs && !clineMsg.partial) {
				// 给消息打上参与者标记，转发到主消息流
				// 创建浅拷贝避免修改原始消息
				const taggedMsg: ClineMessage = {
					...clineMsg,
					participantId: participant.id,
					participantName: participant.name,
					participantColor: participant.color,
				}
				this.onClineMessage(taggedMsg)

				// 对 text 消息同时维护内部讨论状态
				if (clineMsg.type === "say" && clineMsg.say === "text" && clineMsg.text) {
					this.addDiscussionMessage(participant, messageType, phase, clineMsg.text)
				}

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
		parts.push(`## Discussion Topic\n\n${this.state.config.topic}`)

		// Extra context (other participants' output, user message, etc.)
		if (extraContext) {
			parts.push(`## Context\n\n${extraContext}`)
		}

		// Instruction to complete and use attempt_completion
		parts.push(`## Instructions\n\nWhen you have finished your response for this phase, use the attempt_completion tool to present your output. Your completion result should contain only your response for this phase.`)

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
			.map((m) => `### ${m.participantName} (${m.type}, phase: ${m.phase})\n\n${m.content}`)
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
	 * 添加系统级消息（不归属于任何参与者）。
	 * 同时通过 onClineMessage 发送到主消息流，在 ChatView 中以 say:"text" 形式展示。
	 */
	private addSystemMessage(content: string): void {
		const msg: DiscussionMessage = {
			id: uuidv4(),
			participantId: "system",
			participantName: "System",
			type: "system",
			content,
			phase: this.state.phase,
			timestamp: Date.now(),
		}
		this.messages.push(msg)
		this.emitMessageStreamItem(msg)

		// 同步发送到主 clineMessages 流，让 ChatView 也能显示系统消息
		this.onClineMessage({
			ts: Date.now(),
			type: "say",
			say: "text",
			text: `[系统] ${content}`,
			participantId: "system",
			participantName: "系统",
			participantColor: "#888888",
		})
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
			this.onError("No proposal to apply")
			return
		}

		this.state.status = "reviewing"
		this.notifyStateUpdate()

		const workspaceFolders = vscode.workspace.workspaceFolders
		if (!workspaceFolders) {
			this.onError("No workspace folder open")
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
			this.addSystemMessage("Proposal applied to workspace.")
			this.notifyStateUpdate()
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error)
			this.onError(`Failed to apply proposal: ${errorMsg}`)
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
		this.addSystemMessage("Proposal rejected.")
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
