export interface DiscussionParticipant {
	id: string
	name: string
	role: string
	color: string
	providerId?: string
	modelId?: string
	apiKey?: string
	baseURL?: string
}

export interface DiscussionConfig {
	topic: string
	mode: "roundtable" | "chat"
	maxRounds: number
	participants: DiscussionParticipant[]
}

export type DiscussionPhase = "familiarize" | "align" | "discuss" | "converge" | "propose"
export type DiscussionStatus = "idle" | "discussing" | "consensus" | "proposing" | "reviewing" | "done" | "rejected"
export type DiscussionMessageType = "familiarize" | "align" | "lead" | "critique" | "revise" | "user" | "system" | "error"

export interface DiscussionMessage {
	id: string
	participantId: string
	participantName: string
	type: DiscussionMessageType
	content: string
	phase: DiscussionPhase
	timestamp: number
}

export interface DiscussionStreamItem {
	id: string
	kind: "message" | "tool" | "error"
	msg?: DiscussionMessage
	toolName?: string
	toolArgs?: any
	toolResult?: string
	toolStatus?: "pending" | "success" | "error"
	participantId?: string
	participantName?: string
}

export interface DiscussionState {
	id: string
	config: DiscussionConfig
	phase: DiscussionPhase
	status: DiscussionStatus
	currentRound: number
	currentPhase: DiscussionPhase | null
	streamingParticipantIds: string[]
	proposal?: {
		summary: string
		changes: Array<{
			action: "create" | "modify" | "delete"
			filePath: string
			content?: string
			diff?: string
		}>
	}
}
