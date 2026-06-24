// 共享类型定义 - 前后端通用

// ============ API 提供商 ============
export type ProviderType = 'relay' | 'official' | 'coding-plan'
export type ProtocolType = 'openai' | 'anthropic' | 'custom'

export interface ModelInfo {
  id: string
  name?: string
  contextWindow?: number
  enabled?: boolean
}

export interface Provider {
  id: string
  name: string
  type: ProviderType
  baseUrl: string
  apiKey: string
  protocol: ProtocolType
  models: ModelInfo[]
  defaultModel?: string
  createdAt: number
}

// ============ AI 参与方 ============
export interface Participant {
  id: string
  name: string
  avatar?: string
  color?: string
  providerId: string
  model: string
  systemPrompt: string
  temperature: number
  enabled: boolean
  createdAt: number
}

// ============ 项目 ============
export interface Project {
  id: string
  name: string
  path: string
  ignorePatterns: string[]
  createdAt: number
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

// ============ 讨论会话 ============
export type DiscussionStatus =
  | 'discussing'
  | 'consensus'
  | 'proposing'
  | 'reviewing'
  | 'executing'
  | 'done'
  | 'rejected'

export type MessageType = 'familiarize' | 'align' | 'lead' | 'critique' | 'revise' | 'summary' | 'system' | 'user'

export interface DiscussionMessage {
  id: string
  round: number
  participantId: string
  participantName: string
  role: 'user' | 'assistant'
  content: string
  type: MessageType
  timestamp: number
}

export interface DiscussionRound {
  index: number
  phase: 'familiarize' | 'align' | 'propose' | 'critique' | 'refine' | 'converge'
  messages: DiscussionMessage[]
}

export interface DiscussionContext {
  filePaths: string[]
  instruction: string
}

export interface Discussion {
  id: string
  projectId: string
  topic: string
  context: DiscussionContext
  participantIds: string[]
  rounds: DiscussionRound[]
  status: DiscussionStatus
  mode: 'roundtable' | 'chat'
  maxRounds: number
  currentRound: number
  consensus?: string
  proposalId?: string
  createdAt: number
  updatedAt: number
}

// ============ 修改方案 ============
export type ChangeAction = 'create' | 'modify' | 'delete'
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'executed'

export interface FileChange {
  id: string
  filePath: string
  action: ChangeAction
  content: string
  originalContent?: string
  diff?: string
  reason: string
}

export interface Proposal {
  id: string
  discussionId: string
  summary: string
  changes: FileChange[]
  status: ProposalStatus
  createdAt: number
}

// ============ WebSocket 消息 ============
export type WsEventType =
  | 'discussion:round-start'
  | 'discussion:message-start'
  | 'discussion:message-chunk'
  | 'discussion:message-end'
  | 'discussion:round-end'
  | 'discussion:consensus'
  | 'discussion:proposal'
  | 'discussion:status'
  | 'discussion:error'
  | 'discussion:done'

export interface WsEvent {
  type: WsEventType
  discussionId: string
  data?: any
}

// ============ LLM 调用 ============
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  model: string
  temperature?: number
  systemPrompt?: string
  maxTokens?: number
}

// ============ 角色预设模板 ============
export interface RolePreset {
  name: string
  systemPrompt: string
  color: string
}
