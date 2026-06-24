// Zustand store - 通过 postMessage 与扩展宿主通信
import { create } from 'zustand'
import { postMessage, onMessage } from './vscodeApi'
import type { Provider, Participant, Discussion, DiscussionMessage, Proposal } from '../../../shared/types'

type View = 'discussions' | 'detail' | 'providers' | 'participants'

// 统一消息流条目(文本消息 + 工具调用 + 错误)
export interface StreamItem {
  id: string
  kind: 'message' | 'tool' | 'error'
  // message
  msg?: DiscussionMessage
  // tool
  toolName?: string
  toolArgs?: any
  toolResult?: string
  toolStatus?: 'pending' | 'success' | 'error'
  // common
  participantId?: string
  participantName?: string
  round?: number
  timestamp: number
}

interface AppState {
  view: View
  workspace: { name: string; path: string } | null
  providers: Provider[]
  participants: Participant[]
  discussions: Discussion[]
  currentDiscussion: (Discussion & { proposal?: Proposal }) | null
  streamItems: StreamItem[]
  streamingParticipantIds: string[]
  liveStatus: string | null
  error: string | null
  isAtBottom: boolean

  modelLoading: string | null
  testResult: { id: string; success: boolean; message: string } | null
  pendingConfirm: { confirmId: string; name: string; args: any; participantName: string } | null

  setView: (v: View) => void
  setAtBottom: (b: boolean) => void
  init: () => void
  refreshProviders: () => void
  saveProvider: (data: any) => void
  deleteProvider: (id: string) => void
  fetchModels: (id: string) => void
  testProvider: (id: string) => void
  refreshParticipants: () => void
  saveParticipant: (data: any) => void
  deleteParticipant: (id: string) => void
  refreshDiscussions: () => void
  createDiscussion: (data: any) => void
  openDiscussion: (id: string) => void
  sendChat: (id: string, msg: string) => void
  generateProposal: (id: string) => void
  stopDiscussion: (id: string) => void
  approveProposal: (id: string) => void
  rejectProposal: (id: string) => void
  dismissError: () => void
  approveTool: (confirmId: string) => void
  denyTool: (confirmId: string) => void
}

function discussionsToItems(d: Discussion & { proposal?: Proposal }): StreamItem[] {
  const items: StreamItem[] = []
  for (const round of d.rounds || []) {
    for (const msg of round.messages || []) {
      items.push({ id: msg.id, kind: 'message', msg, participantId: msg.participantId, participantName: msg.participantName, round: round.index, timestamp: msg.timestamp })
    }
  }
  return items
}

export const useStore = create<AppState>((set, get) => ({
  view: 'discussions',
  workspace: null,
  providers: [],
  participants: [],
  discussions: [],
  currentDiscussion: null,
  streamItems: [],
  streamingParticipantIds: [],
  liveStatus: null,
  error: null,
  isAtBottom: true,
  modelLoading: null,
  testResult: null,
  pendingConfirm: null,

  setView: (v) => set({ view: v }),
  setAtBottom: (b) => set({ isAtBottom: b }),
  dismissError: () => set({ error: null }),
  approveTool: (confirmId: string) => {
    postMessage({ type: 'discussion:tool-approve', confirmId })
    set({ pendingConfirm: null })
  },
  denyTool: (confirmId: string) => {
    postMessage({ type: 'discussion:tool-deny', confirmId })
    set({ pendingConfirm: null })
  },

  init: () => {
    postMessage({ type: 'ready' })
    onMessage((msg) => {
      switch (msg.type) {
        case 'provider:list':
          set({ providers: msg.data })
          break
        case 'provider:models':
          set((s) => ({
            providers: s.providers.map((p) =>
              p.id === msg.data.id
                ? { ...p, models: msg.data.models.map((m: any) => ({ id: m.id, name: m.name, enabled: true })) }
                : p,
            ),
            modelLoading: null,
          }))
          break
        case 'provider:test':
          set({ testResult: { id: msg.data.id, success: msg.data.success, message: msg.data.message } })
          setTimeout(() => set({ testResult: null }), 5000)
          break
        case 'provider:fetch-start':
          set({ modelLoading: msg.data.id })
          break
        case 'participant:list':
          set({ participants: msg.data })
          break
        case 'discussion:list':
          set({ discussions: msg.data })
          break
        case 'workspace:info':
          set({ workspace: msg.data })
          break
        case 'discussion:detail':
          set({
            currentDiscussion: msg.data,
            streamItems: msg.data ? discussionsToItems(msg.data) : [],
          })
          break
        case 'discussion:created':
          set({ discussions: [msg.data, ...get().discussions] })
          get().openDiscussion(msg.data.id)
          break
        case 'discussion:message-start':
          set((s) => ({ streamingParticipantIds: [...s.streamingParticipantIds, msg.data.participantId] }))
          break
        case 'discussion:chunk': {
          set((s) => {
            const items = [...s.streamItems]
            // 找到当前 participant 正在 streaming 的消息
            const idx = items.findIndex((it) => it.id === 'streaming' && it.participantId === msg.data.participantId && it.round === msg.data.round)
            if (idx !== -1) {
              items[idx] = { ...items[idx], msg: { ...(items[idx].msg as any), content: ((items[idx].msg?.content) || '') + msg.data.chunk } }
            } else {
              items.push({
                id: 'streaming',
                kind: 'message',
                msg: { id: 'streaming', round: msg.data.round, participantId: msg.data.participantId, participantName: msg.data.participantName || '', role: 'assistant', content: msg.data.chunk, type: msg.data.type || 'idea', timestamp: Date.now() },
                participantId: msg.data.participantId,
                participantName: msg.data.participantName,
                round: msg.data.round,
                timestamp: Date.now(),
              })
            }
            return { streamItems: items }
          })
          break
        }
        case 'discussion:message-end':
          set((s) => {
            const items = [...s.streamItems]
            const idx = items.findIndex((it) => it.id === 'streaming' && it.participantId === msg.data.participantId)
            if (idx !== -1) {
              items[idx] = { ...items[idx], id: msg.data.message.id, msg: msg.data.message }
            } else {
              items.push({ id: msg.data.message.id, kind: 'message', msg: msg.data.message, participantId: msg.data.participantId, participantName: msg.data.participantName, round: msg.data.round, timestamp: Date.now() })
            }
            return { streamItems: items, streamingParticipantIds: s.streamingParticipantIds.filter(id => id !== msg.data.participantId) }
          })
          break
        case 'discussion:tool-call':
          set((s) => ({
            streamItems: [...s.streamItems, {
              id: `tool_${Date.now()}_${Math.random()}`,
              kind: 'tool',
              toolName: msg.data.name,
              toolArgs: msg.data.args,
              toolStatus: 'pending',
              participantId: msg.data.participantId,
              participantName: msg.data.participantName,
              round: msg.data.round,
              timestamp: Date.now(),
            }],
          }))
          break
        case 'discussion:tool-result':
          set((s) => {
            const items = [...s.streamItems]
            // 找最后一个同 participant 的 pending tool
            for (let i = items.length - 1; i >= 0; i--) {
              if (items[i].kind === 'tool' && items[i].participantId === msg.data.participantId && items[i].toolStatus === 'pending') {
                items[i] = { ...items[i], toolResult: msg.data.result, toolStatus: msg.data.result?.startsWith('✗') || msg.data.result?.startsWith('错误') ? 'error' : 'success' }
                break
              }
            }
            return { streamItems: items }
          })
          break
        case 'discussion:tool-confirm':
          set({ pendingConfirm: { confirmId: msg.data.confirmId, name: msg.data.name, args: msg.data.args, participantName: msg.data.participantName } })
          break
        case 'discussion:status':
          set((s) => ({
            liveStatus: msg.data.status,
            currentDiscussion: s.currentDiscussion ? { ...s.currentDiscussion, status: msg.data.status } : null,
          }))
          break
        case 'discussion:proposal':
          set((s) => ({
            currentDiscussion: s.currentDiscussion ? { ...s.currentDiscussion, proposal: msg.data.proposal } : null,
          }))
          break
        case 'error':
          set((s) => ({
            error: msg.message,
            streamItems: [...s.streamItems, { id: `err_${Date.now()}`, kind: 'error', timestamp: Date.now() }],
            streamingParticipantIds: [],
          }))
          break
      }
    })
  },

  refreshProviders: () => postMessage({ type: 'provider:list' }),
  saveProvider: (data) => postMessage({ type: 'provider:save', data }),
  deleteProvider: (id) => postMessage({ type: 'provider:delete', id }),
  fetchModels: (id) => {
    set({ modelLoading: id })
    postMessage({ type: 'provider:fetchModels', id })
  },
  testProvider: (id) => postMessage({ type: 'provider:test', id }),

  refreshParticipants: () => postMessage({ type: 'participant:list' }),
  saveParticipant: (data) => postMessage({ type: 'participant:save', data }),
  deleteParticipant: (id) => postMessage({ type: 'participant:delete', id }),

  refreshDiscussions: () => postMessage({ type: 'discussion:list' }),
  createDiscussion: (data) => postMessage({ type: 'discussion:create', data }),
  openDiscussion: (id) => {
    set({ streamItems: [], streamingParticipantIds: [], liveStatus: null, view: 'detail' })
    postMessage({ type: 'discussion:get', id })
  },
  sendChat: (id, msg) => postMessage({ type: 'discussion:chat', id, message: msg }),
  generateProposal: (id) => postMessage({ type: 'discussion:generateProposal', id }),
  stopDiscussion: (id) => postMessage({ type: 'discussion:stop', id }),
  approveProposal: (id) => postMessage({ type: 'discussion:approve', id }),
  rejectProposal: (id) => postMessage({ type: 'discussion:reject', id }),
}))
