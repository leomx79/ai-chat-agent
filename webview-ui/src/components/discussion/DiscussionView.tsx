import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import {
	ArrowLeft,
	ChevronDown,
	ChevronRight,
	CircleStop,
	FileCode,
	FileMinus,
	FilePlus,
	Loader2,
	Plus,
	Send,
	Sparkles,
	Trash2,
	Users,
	X,
} from "lucide-react"
import MarkdownBlock from "@/components/common/MarkdownBlock"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useDiscussion } from "@/hooks/useDiscussion"
import type {
	DiscussionConfig,
	DiscussionParticipant,
	DiscussionPhase,
	DiscussionStreamItem,
} from "@shared/discussion-types"

// --- Constants ---

const ROLE_PRESETS = [
	{ value: "architect", label: "Architect" },
	{ value: "reviewer", label: "Reviewer" },
	{ value: "implementer", label: "Implementer" },
	{ value: "product", label: "Product" },
	{ value: "performance", label: "Performance" },
	{ value: "tester", label: "Tester" },
]

const PROVIDER_OPTIONS = [
	{ value: "anthropic", label: "Anthropic" },
	{ value: "openrouter", label: "OpenRouter" },
	{ value: "openai", label: "OpenAI Compatible" },
	{ value: "openai-native", label: "OpenAI" },
	{ value: "deepseek", label: "DeepSeek" },
	{ value: "gemini", label: "Google Gemini" },
	{ value: "mistral", label: "Mistral" },
	{ value: "xai", label: "xAI" },
	{ value: "qwen", label: "Alibaba Qwen" },
	{ value: "doubao", label: "Bytedance Doubao" },
	{ value: "together", label: "Together" },
	{ value: "requesty", label: "Requesty" },
	{ value: "sambanova", label: "SambaNova" },
	{ value: "cerebras", label: "Cerebras" },
	{ value: "ollama", label: "Ollama" },
	{ value: "lmstudio", label: "LM Studio" },
	{ value: "litellm", label: "LiteLLM" },
	{ value: "vscode-lm", label: "VS Code LM API" },
	{ value: "cline", label: "Cline" },
]

const PARTICIPANT_COLORS = [
	"#f87171",
	"#fbbf24",
	"#34d399",
	"#60a5fa",
	"#a78bfa",
	"#f472b6",
	"#22d3ee",
	"#fb923c",
]

const PHASES: DiscussionPhase[] = ["familiarize", "align", "discuss", "converge", "propose"]

const PHASE_LABELS: Record<DiscussionPhase, string> = {
	familiarize: "Familiarize",
	align: "Align",
	discuss: "Discuss",
	converge: "Converge",
	propose: "Propose",
}

const MESSAGE_TYPE_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
	familiarize: { bg: "rgba(96,165,250,0.15)", fg: "#60a5fa", label: "Familiarize" },
	align: { bg: "rgba(34,211,238,0.15)", fg: "#22d3ee", label: "Align" },
	lead: { bg: "rgba(167,139,250,0.15)", fg: "#a78bfa", label: "Lead" },
	critique: { bg: "rgba(251,146,60,0.15)", fg: "#fb923c", label: "Critique" },
	revise: { bg: "rgba(251,191,36,0.15)", fg: "#fbbf24", label: "Revise" },
	user: { bg: "rgba(52,211,153,0.15)", fg: "#34d399", label: "User" },
	system: { bg: "rgba(148,163,184,0.15)", fg: "#94a3b8", label: "System" },
	error: { bg: "rgba(248,113,113,0.15)", fg: "#f87171", label: "Error" },
}

// --- Types ---

interface DiscussionViewProps {
	onDone: () => void
}

interface ParticipantDraft extends DiscussionParticipant {
	id: string
}

// --- Helper to generate unique IDs ---

let _idCounter = 0
const genId = () => `draft-${Date.now()}-${++_idCounter}`

// --- Sub-components ---

const Avatar = ({ name, color, size = 32 }: { name: string; color: string; size?: number }) => {
	const initial = (name || "?").charAt(0).toUpperCase()
	return (
		<div
			className="flex items-center justify-center rounded-full font-semibold flex-shrink-0"
			style={{ width: size, height: size, backgroundColor: color, color: "#fff", fontSize: size * 0.45 }}>
			{initial}
		</div>
	)
}

const PhaseProgressBar = ({ currentPhase }: { currentPhase: DiscussionPhase | null }) => {
	const currentIndex = currentPhase ? PHASES.indexOf(currentPhase) : -1
	return (
		<div className="flex items-center gap-1 w-full">
			{PHASES.map((phase, i) => {
				const isDone = currentIndex >= 0 && i < currentIndex
				const isCurrent = currentIndex === i
				return (
					<div key={phase} className="flex items-center gap-1 flex-1">
						<div
							className="h-1.5 flex-1 rounded-full transition-colors"
							style={{
								backgroundColor: isCurrent
									? "var(--vscode-focusBorder)"
									: isDone
										? "var(--vscode-button-background)"
										: "var(--vscode-editorWidget-background)",
							}}
						/>
						<span
							className="text-xs whitespace-nowrap"
							style={{
								color: isCurrent
									? "var(--vscode-focusBorder)"
									: isDone
										? "var(--vscode-descriptionForeground)"
										: "var(--vscode-disabledForeground)",
							}}>
							{PHASE_LABELS[phase]}
						</span>
					</div>
				)
			})}
		</div>
	)
}

const MessageTypeBadge = ({ type }: { type: string }) => {
	const style = MESSAGE_TYPE_STYLES[type] || MESSAGE_TYPE_STYLES.system
	return (
		<span
			className="text-xs px-1.5 py-0.5 rounded font-medium"
			style={{ backgroundColor: style.bg, color: style.fg }}>
			{style.label}
		</span>
	)
}

const ToolCallCard = ({ item }: { item: DiscussionStreamItem }) => {
	const [expanded, setExpanded] = useState(false)
	const statusColor =
		item.toolStatus === "success"
			? "#34d399"
			: item.toolStatus === "error"
				? "#f87171"
				: "#fbbf24"

	return (
		<div
			className="rounded border my-1.5 overflow-hidden"
			style={{ borderColor: "var(--vscode-editorWidget-border)" }}>
			<button
				onClick={() => setExpanded(!expanded)}
				className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--vscode-list-hoverBackground)] transition-colors">
				{expanded ? (
					<ChevronDown size={14} style={{ color: "var(--vscode-descriptionForeground)" }} />
				) : (
					<ChevronRight size={14} style={{ color: "var(--vscode-descriptionForeground)" }} />
				)}
				<span className="text-sm font-medium" style={{ color: "var(--vscode-foreground)" }}>
					{item.toolName || "Tool"}
				</span>
				{item.participantName && (
					<span className="text-xs" style={{ color: "var(--vscode-descriptionForeground)" }}>
						by {item.participantName}
					</span>
				)}
				<span className="ml-auto flex items-center gap-1">
					{item.toolStatus === "pending" && (
						<Loader2 size={12} className="animate-spin" style={{ color: statusColor }} />
					)}
					<span
						className="text-xs px-1.5 py-0.5 rounded"
						style={{ backgroundColor: `${statusColor}22`, color: statusColor }}>
						{item.toolStatus || "pending"}
					</span>
				</span>
			</button>
			{expanded && (
				<div className="px-3 py-2 space-y-2 border-t" style={{ borderColor: "var(--vscode-editorWidget-border)" }}>
					{item.toolArgs != null && (
						<div>
							<div className="text-xs mb-0.5" style={{ color: "var(--vscode-descriptionForeground)" }}>
								Arguments
							</div>
							<pre
								className="text-xs p-2 rounded overflow-x-auto"
								style={{
									backgroundColor: "var(--vscode-textCodeBlock-background)",
									color: "var(--vscode-foreground)",
								}}>
								{typeof item.toolArgs === "string"
									? item.toolArgs
									: JSON.stringify(item.toolArgs, null, 2)}
							</pre>
						</div>
					)}
					{item.toolResult && (
						<div>
							<div className="text-xs mb-0.5" style={{ color: "var(--vscode-descriptionForeground)" }}>
								Result
							</div>
							<pre
								className="text-xs p-2 rounded overflow-x-auto max-h-48 overflow-y-auto"
								style={{
									backgroundColor: "var(--vscode-textCodeBlock-background)",
									color: "var(--vscode-foreground)",
								}}>
								{item.toolResult}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	)
}

const ErrorCard = ({ message }: { message: string }) => (
	<div
		className="rounded p-3 my-1.5 flex items-start gap-2"
		style={{
			backgroundColor: "rgba(248,113,113,0.1)",
			border: "1px solid rgba(248,113,113,0.3)",
		}}>
		<X size={16} className="flex-shrink-0 mt-0.5" style={{ color: "#f87171" }} />
		<span className="text-sm" style={{ color: "var(--vscode-errorForeground)" }}>
			{message}
		</span>
	</div>
)

const ProposalReviewPanel = () => {
	const { discussionState, approveProposal, rejectProposal } = useDiscussion()
	const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

	if (!discussionState?.proposal) {
		return null
	}

	const { summary, changes } = discussionState.proposal

	const toggleFile = (path: string) => {
		setExpandedFiles((prev) => {
			const next = new Set(prev)
			if (next.has(path)) {
				next.delete(path)
			} else {
				next.add(path)
			}
			return next
		})
	}

	const actionIcon = (action: string) => {
		switch (action) {
			case "create":
				return <FilePlus size={14} style={{ color: "#34d399" }} />
			case "delete":
				return <FileMinus size={14} style={{ color: "#f87171" }} />
			default:
				return <FileCode size={14} style={{ color: "#60a5fa" }} />
		}
	}

	return (
		<div
			className="rounded-lg border p-4 mt-3"
			style={{
				borderColor: "var(--vscode-focusBorder)",
				backgroundColor: "var(--vscode-editorWidget-background)",
			}}>
			<div className="flex items-center gap-2 mb-2">
				<Sparkles size={18} style={{ color: "var(--vscode-focusBorder)" }} />
				<h3 className="text-base font-semibold" style={{ color: "var(--vscode-foreground)" }}>
					Proposal
				</h3>
			</div>
			{summary && (
				<div className="mb-3">
					<MarkdownBlock markdown={summary} />
				</div>
			)}
			<div className="space-y-1 mb-3">
				<div className="text-sm font-medium mb-1" style={{ color: "var(--vscode-foreground)" }}>
					File Changes ({changes.length})
				</div>
				{changes.map((change, i) => {
					const key = `${change.filePath}-${i}`
					const isExpanded = expandedFiles.has(key)
					return (
						<div
							key={key}
							className="rounded border overflow-hidden"
							style={{ borderColor: "var(--vscode-editorWidget-border)" }}>
							<button
								onClick={() => toggleFile(key)}
								className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-[var(--vscode-list-hoverBackground)] transition-colors">
								{isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
								{actionIcon(change.action)}
								<span className="text-sm font-mono" style={{ color: "var(--vscode-foreground)" }}>
									{change.filePath}
								</span>
								<span
									className="text-xs px-1 rounded ml-auto"
									style={{ color: "var(--vscode-descriptionForeground)" }}>
									{change.action}
								</span>
							</button>
							{isExpanded && (change.diff || change.content) && (
								<pre
									className="text-xs p-2 overflow-x-auto max-h-64 overflow-y-auto border-t"
									style={{
										backgroundColor: "var(--vscode-textCodeBlock-background)",
										color: "var(--vscode-foreground)",
										borderColor: "var(--vscode-editorWidget-border)",
									}}>
									{change.diff || change.content}
								</pre>
							)}
						</div>
					)
				})}
			</div>
			<div className="flex gap-2">
				<button
					onClick={approveProposal}
					className="px-4 py-1.5 rounded text-sm font-medium transition-colors"
					style={{
						backgroundColor: "var(--vscode-button-background)",
						color: "var(--vscode-button-foreground)",
					}}>
					Approve
				</button>
				<button
					onClick={rejectProposal}
					className="px-4 py-1.5 rounded text-sm font-medium border transition-colors"
					style={{
						borderColor: "var(--vscode-input-border)",
						color: "var(--vscode-foreground)",
						backgroundColor: "transparent",
					}}>
					Reject
				</button>
			</div>
		</div>
	)
}

// --- Participant form row ---

const ParticipantRow = ({
	participant,
	index,
	onChange,
	onRemove,
}: {
	participant: ParticipantDraft
	index: number
	onChange: (p: ParticipantDraft) => void
	onRemove: () => void
}) => {
	const update = (field: keyof ParticipantDraft, value: string) => {
		onChange({ ...participant, [field]: value })
	}

	return (
		<div
			className="rounded-lg border p-3 space-y-2"
			style={{
				borderColor: "var(--vscode-input-border)",
				backgroundColor: "var(--vscode-editor-background)",
			}}>
			<div className="flex items-center gap-2">
				<Avatar name={participant.name || "?"} color={participant.color} size={28} />
				<span className="text-sm font-medium" style={{ color: "var(--vscode-foreground)" }}>
					Participant {index + 1}
				</span>
				<button
					onClick={onRemove}
					className="ml-auto p-1 rounded hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
					title="Remove participant">
					<Trash2 size={14} style={{ color: "var(--vscode-errorForeground)" }} />
				</button>
			</div>
			<div className="grid grid-cols-2 gap-2">
				<div>
					<label className="text-xs block mb-0.5" style={{ color: "var(--vscode-descriptionForeground)" }}>
						Name
					</label>
					<input
						type="text"
						value={participant.name}
						onChange={(e) => update("name", e.target.value)}
						placeholder="e.g. Alice"
						className="w-full text-sm px-2 py-1 rounded border"
						style={{
							backgroundColor: "var(--vscode-input-background)",
							color: "var(--vscode-input-foreground)",
							borderColor: "var(--vscode-input-border)",
						}}
					/>
				</div>
				<div>
					<label className="text-xs block mb-0.5" style={{ color: "var(--vscode-descriptionForeground)" }}>
						Role Preset
					</label>
					<select
						value={participant.role}
						onChange={(e) => update("role", e.target.value)}
						className="w-full text-sm px-2 py-1 rounded border"
						style={{
							backgroundColor: "var(--vscode-input-background)",
							color: "var(--vscode-input-foreground)",
							borderColor: "var(--vscode-input-border)",
						}}>
						{ROLE_PRESETS.map((r) => (
							<option key={r.value} value={r.value}>
								{r.label}
							</option>
						))}
					</select>
				</div>
				<div>
					<label className="text-xs block mb-0.5" style={{ color: "var(--vscode-descriptionForeground)" }}>
						Color
					</label>
					<div className="flex items-center gap-1 flex-wrap">
						{PARTICIPANT_COLORS.map((color) => (
							<button
								key={color}
								onClick={() => update("color", color)}
								className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
								style={{
									backgroundColor: color,
									borderColor: participant.color === color ? "var(--vscode-focusBorder)" : "transparent",
								}}
							/>
						))}
					</div>
				</div>
				<div>
					<label className="text-xs block mb-0.5" style={{ color: "var(--vscode-descriptionForeground)" }}>
						Provider
					</label>
					<select
						value={participant.providerId || ""}
						onChange={(e) => update("providerId", e.target.value)}
						className="w-full text-sm px-2 py-1 rounded border"
						style={{
							backgroundColor: "var(--vscode-input-background)",
							color: "var(--vscode-input-foreground)",
							borderColor: "var(--vscode-input-border)",
						}}>
						<option value="">Select provider...</option>
						{PROVIDER_OPTIONS.map((p) => (
							<option key={p.value} value={p.value}>
								{p.label}
							</option>
						))}
					</select>
				</div>
				<div>
					<label className="text-xs block mb-0.5" style={{ color: "var(--vscode-descriptionForeground)" }}>
						Model ID
					</label>
					<input
						type="text"
						value={participant.modelId || ""}
						onChange={(e) => update("modelId", e.target.value)}
						placeholder="e.g. claude-sonnet-4-20250514"
						className="w-full text-sm px-2 py-1 rounded border"
						style={{
							backgroundColor: "var(--vscode-input-background)",
							color: "var(--vscode-input-foreground)",
							borderColor: "var(--vscode-input-border)",
						}}
					/>
				</div>
				<div>
					<label className="text-xs block mb-0.5" style={{ color: "var(--vscode-descriptionForeground)" }}>
						API Key
					</label>
					<input
						type="password"
						value={participant.apiKey || ""}
						onChange={(e) => update("apiKey", e.target.value)}
						placeholder="Optional (uses global config)"
						className="w-full text-sm px-2 py-1 rounded border"
						style={{
							backgroundColor: "var(--vscode-input-background)",
							color: "var(--vscode-input-foreground)",
							borderColor: "var(--vscode-input-border)",
						}}
					/>
				</div>
			</div>
		</div>
	)
}

// --- Main component ---

const DiscussionView = ({ onDone }: DiscussionViewProps) => {
	const { discussionState, discussionStreamItems, discussionError } = useExtensionState()
	const { createDiscussion, sendChatMessage, stopDiscussion, generateProposal, clearDiscussion } = useDiscussion()

	// Form state
	const [topic, setTopic] = useState("")
	const [mode, setMode] = useState<"roundtable" | "chat">("roundtable")
	const [maxRounds, setMaxRounds] = useState(3)
	const [participants, setParticipants] = useState<ParticipantDraft[]>([
		{
			id: genId(),
			name: "",
			role: "architect",
			color: PARTICIPANT_COLORS[0],
			providerId: "",
			modelId: "",
			apiKey: "",
		},
		{
			id: genId(),
			name: "",
			role: "reviewer",
			color: PARTICIPANT_COLORS[1],
			providerId: "",
			modelId: "",
			apiKey: "",
		},
	])

	// Chat input state
	const [chatInput, setChatInput] = useState("")

	// Auto-scroll
	const streamEndRef = useRef<HTMLDivElement>(null)
	const streamContainerRef = useRef<HTMLDivElement>(null)

	const isActive = !!discussionState
	const isChatMode = discussionState?.config.mode === "chat"
	const isDiscussing = discussionState?.status === "discussing"

	const scrollToBottom = useCallback(() => {
		streamEndRef.current?.scrollIntoView({ behavior: "smooth" })
	}, [])

	useEffect(() => {
		scrollToBottom()
	}, [discussionStreamItems, scrollToBottom])

	const handleAddParticipant = () => {
		setParticipants((prev) => [
			...prev,
			{
				id: genId(),
				name: "",
				role: ROLE_PRESETS[prev.length % ROLE_PRESETS.length].value,
				color: PARTICIPANT_COLORS[prev.length % PARTICIPANT_COLORS.length],
				providerId: "",
				modelId: "",
				apiKey: "",
			},
		])
	}

	const handleUpdateParticipant = (id: string, updated: ParticipantDraft) => {
		setParticipants((prev) => prev.map((p) => (p.id === id ? updated : p)))
	}

	const handleRemoveParticipant = (id: string) => {
		setParticipants((prev) => prev.filter((p) => p.id !== id))
	}

	const handleStartDiscussion = () => {
		const validParticipants = participants.filter((p) => p.name.trim())
		if (!topic.trim() || validParticipants.length === 0) {
			return
		}
		const config: DiscussionConfig = {
			topic: topic.trim(),
			mode,
			maxRounds,
			participants: validParticipants.map(({ id, ...rest }) => ({
				...rest,
				id,
			})),
		}
		createDiscussion(config)
	}

	const handleSendChat = () => {
		const text = chatInput.trim()
		if (!text) return
		sendChatMessage(text)
		setChatInput("")
	}

	const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault()
			handleSendChat()
		}
	}

	const handleBack = () => {
		clearDiscussion()
		onDone()
	}

	// Build a map of participant colors for rendering messages
	const participantColorMap = useMemo(() => {
		const map: Record<string, string> = {}
		if (discussionState) {
			for (const p of discussionState.config.participants) {
				map[p.id] = p.color
			}
		}
		return map
	}, [discussionState])

	// --- List View (no active discussion) ---

	if (!isActive) {
		return (
			<div className="fixed inset-0 z-[200] flex flex-col" style={{ backgroundColor: "var(--vscode-editor-background)" }}>
				{/* Header */}
				<div
					className="flex items-center gap-2 px-4 py-3 border-b"
					style={{ borderColor: "var(--vscode-editorWidget-border)" }}>
					<button
						onClick={onDone}
						className="p-1 rounded hover:bg-[var(--vscode-list-hoverBackground)] transition-colors">
						<ArrowLeft size={18} style={{ color: "var(--vscode-foreground)" }} />
					</button>
					<Users size={18} style={{ color: "var(--vscode-focusBorder)" }} />
					<h2 className="text-base font-semibold" style={{ color: "var(--vscode-foreground)" }}>
						Multi-AI Discussion
					</h2>
				</div>

				{/* Scrollable form area */}
				<div ref={streamContainerRef} className="flex-1 overflow-y-auto scrollable px-4 py-4">
					<div className="max-w-2xl mx-auto space-y-4">
						{/* Topic */}
						<div>
							<label className="text-sm font-medium block mb-1" style={{ color: "var(--vscode-foreground)" }}>
								Topic
							</label>
							<input
								type="text"
								value={topic}
								onChange={(e) => setTopic(e.target.value)}
								placeholder="What should the AIs discuss?"
								className="w-full text-sm px-3 py-2 rounded border"
								style={{
									backgroundColor: "var(--vscode-input-background)",
									color: "var(--vscode-input-foreground)",
									borderColor: "var(--vscode-input-border)",
								}}
							/>
						</div>

						{/* Mode & Rounds */}
						<div className="grid grid-cols-2 gap-3">
							<div>
								<label className="text-sm font-medium block mb-1" style={{ color: "var(--vscode-foreground)" }}>
									Mode
								</label>
								<select
									value={mode}
									onChange={(e) => setMode(e.target.value as "roundtable" | "chat")}
									className="w-full text-sm px-2 py-2 rounded border"
									style={{
										backgroundColor: "var(--vscode-input-background)",
										color: "var(--vscode-input-foreground)",
										borderColor: "var(--vscode-input-border)",
									}}>
									<option value="roundtable">Roundtable (autonomous)</option>
									<option value="chat">Chat (interactive)</option>
								</select>
							</div>
							<div>
								<label className="text-sm font-medium block mb-1" style={{ color: "var(--vscode-foreground)" }}>
									Max Rounds
								</label>
								<input
									type="number"
									min={1}
									max={10}
									value={maxRounds}
									onChange={(e) => setMaxRounds(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
									className="w-full text-sm px-3 py-2 rounded border"
									style={{
										backgroundColor: "var(--vscode-input-background)",
										color: "var(--vscode-input-foreground)",
										borderColor: "var(--vscode-input-border)",
									}}
								/>
							</div>
						</div>

						{/* Participants */}
						<div>
							<div className="flex items-center justify-between mb-2">
								<label className="text-sm font-medium" style={{ color: "var(--vscode-foreground)" }}>
									Participants ({participants.length})
								</label>
								<button
									onClick={handleAddParticipant}
									className="flex items-center gap-1 text-sm px-2 py-1 rounded transition-colors"
									style={{
										backgroundColor: "var(--vscode-button-background)",
										color: "var(--vscode-button-foreground)",
									}}>
									<Plus size={14} /> Add
								</button>
							</div>
							<div className="space-y-2">
								{participants.map((p, i) => (
									<ParticipantRow
										key={p.id}
										participant={p}
										index={i}
										onChange={(updated) => handleUpdateParticipant(p.id, updated)}
										onRemove={() => handleRemoveParticipant(p.id)}
									/>
								))}
							</div>
						</div>

						{/* Start button */}
						<button
							onClick={handleStartDiscussion}
							disabled={!topic.trim() || participants.filter((p) => p.name.trim()).length === 0}
							className="w-full flex items-center justify-center gap-2 py-2.5 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
							style={{
								backgroundColor: "var(--vscode-button-background)",
								color: "var(--vscode-button-foreground)",
							}}>
							<Sparkles size={16} />
							Start Discussion
						</button>
					</div>
				</div>
			</div>
		)
	}

	// --- Detail View (active discussion) ---

	const canGenerateProposal =
		discussionState.status === "consensus" || discussionState.status === "done"

	return (
		<div className="fixed inset-0 z-[200] flex flex-col" style={{ backgroundColor: "var(--vscode-editor-background)" }}>
			{/* Header */}
			<div
				className="flex items-center gap-2 px-4 py-2.5 border-b"
				style={{ borderColor: "var(--vscode-editorWidget-border)" }}>
				<button
					onClick={handleBack}
					className="p-1 rounded hover:bg-[var(--vscode-list-hoverBackground)] transition-colors">
					<ArrowLeft size={18} style={{ color: "var(--vscode-foreground)" }} />
				</button>
				<div className="flex-1 min-w-0">
					<h2 className="text-sm font-semibold truncate" style={{ color: "var(--vscode-foreground)" }}>
						{discussionState.config.topic}
					</h2>
					<div className="flex items-center gap-2 mt-0.5">
						<span className="text-xs" style={{ color: "var(--vscode-descriptionForeground)" }}>
							{discussionState.config.participants.length} participants
						</span>
						<span className="text-xs" style={{ color: "var(--vscode-descriptionForeground)" }}>
							· Round {discussionState.currentRound}/{discussionState.config.maxRounds}
						</span>
						<span
							className="text-xs px-1.5 py-0.5 rounded"
							style={{
								backgroundColor: "var(--vscode-badge-background)",
								color: "var(--vscode-badge-foreground)",
							}}>
							{discussionState.status}
						</span>
					</div>
				</div>
				{/* Stop button for roundtable mode */}
				{!isChatMode && isDiscussing && (
					<button
						onClick={stopDiscussion}
						className="flex items-center gap-1 text-sm px-3 py-1.5 rounded transition-colors"
						style={{
							backgroundColor: "var(--vscode-errorForeground)",
							color: "#fff",
						}}>
						<CircleStop size={14} /> Stop
					</button>
				)}
			</div>

			{/* Phase progress bar */}
			<div className="px-4 py-2 border-b" style={{ borderColor: "var(--vscode-editorWidget-border)" }}>
				<PhaseProgressBar currentPhase={discussionState.currentPhase || discussionState.phase} />
			</div>

			{/* Message stream */}
			<div ref={streamContainerRef} className="flex-1 overflow-y-auto scrollable px-4 py-3">
				<div className="max-w-3xl mx-auto space-y-1">
					{discussionStreamItems.length === 0 && (
						<div className="flex items-center justify-center py-12">
							<Loader2 className="animate-spin" size={24} style={{ color: "var(--vscode-descriptionForeground)" }} />
						</div>
					)}
					{discussionStreamItems.map((item) => {
						if (item.kind === "error") {
							return <ErrorCard key={item.id} message={item.toolResult || "An error occurred"} />
						}
						if (item.kind === "tool") {
							return <ToolCallCard key={item.id} item={item} />
						}
						// message kind
						const msg = item.msg
						if (!msg) return null
						const color = participantColorMap[msg.participantId] || "#94a3b8"
						return (
							<div key={item.id} className="flex gap-2.5 py-1.5">
								<Avatar name={msg.participantName} color={color} size={28} />
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2 mb-0.5">
										<span className="text-sm font-medium" style={{ color: "var(--vscode-foreground)" }}>
											{msg.participantName}
										</span>
										<MessageTypeBadge type={msg.type} />
									</div>
									<div
										className="rounded-lg px-3 py-2"
										style={{ backgroundColor: "var(--vscode-editorWidget-background)" }}>
										<MarkdownBlock markdown={msg.content} />
									</div>
								</div>
							</div>
						)
					})}
					<div ref={streamEndRef} />
				</div>
			</div>

			{/* Inline error */}
			{discussionError && (
				<div className="px-4 py-2 border-t" style={{ borderColor: "var(--vscode-editorWidget-border)" }}>
					<ErrorCard message={discussionError} />
				</div>
			)}

			{/* Proposal review */}
			{(discussionState.status === "reviewing" || discussionState.proposal) && (
				<div className="px-4 py-2 border-t max-h-[40vh] overflow-y-auto scrollable" style={{ borderColor: "var(--vscode-editorWidget-border)" }}>
					<ProposalReviewPanel />
				</div>
			)}

			{/* Generate proposal button */}
			{canGenerateProposal && !discussionState.proposal && (
				<div className="px-4 py-2 border-t" style={{ borderColor: "var(--vscode-editorWidget-border)" }}>
					<button
						onClick={generateProposal}
						className="w-full flex items-center justify-center gap-2 py-2 rounded text-sm font-medium transition-colors"
						style={{
							backgroundColor: "var(--vscode-button-background)",
							color: "var(--vscode-button-foreground)",
						}}>
						<Sparkles size={16} />
						Generate Proposal
					</button>
				</div>
			)}

			{/* Chat input (chat mode only) */}
			{isChatMode && (
				<div className="px-4 py-2.5 border-t" style={{ borderColor: "var(--vscode-editorWidget-border)" }}>
					<div className="flex items-end gap-2 max-w-3xl mx-auto">
						<textarea
							value={chatInput}
							onChange={(e) => setChatInput(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="Type a message to the discussion..."
							rows={1}
							className="flex-1 text-sm px-3 py-2 rounded border resize-none"
							style={{
								backgroundColor: "var(--vscode-input-background)",
								color: "var(--vscode-input-foreground)",
								borderColor: "var(--vscode-input-border)",
							}}
						/>
						<button
							onClick={handleSendChat}
							disabled={!chatInput.trim()}
							className="flex items-center justify-center w-9 h-9 rounded transition-colors disabled:opacity-50"
							style={{
								backgroundColor: "var(--vscode-button-background)",
								color: "var(--vscode-button-foreground)",
							}}>
							{isDiscussing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
						</button>
					</div>
				</div>
			)}
		</div>
	)
}

export default DiscussionView
