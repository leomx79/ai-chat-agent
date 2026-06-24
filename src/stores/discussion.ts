// 讨论状态管理 - 含 WebSocket 实时流
import { create } from 'zustand'
import { api } from '@/services/api'
import { wsClient } from '@/services/ws'
import type {
  Discussion,
  Proposal,
  DiscussionMessage,
  DiscussionStatus,
  WsEvent,
} from '../../shared/types'

interface DiscussionState {
  discussions: Discussion[]
  current: (Discussion & { proposal?: Proposal }) | null
  liveMessages: DiscussionMessage[]
  streamingParticipantId: string | null
  streamingText: string
  currentRound: number
  liveStatus: DiscussionStatus | null
  consensus: string | null
  proposal: Proposal | null
  loading: boolean
  error: string | null
  unsubWs: (() => void) | null

  fetchAll: () => Promise<void>
  fetchDetail: (id: string) => Promise<void>
  create: (data: {
    projectId: string
    topic: string
    context: { filePaths: string[]; instruction: string }
    participantIds: string[]
    maxRounds: number
    mode?: 'roundtable' | 'chat'
  }) => Promise<Discussion>
  subscribeLive: (id: string) => void
  unsubscribeLive: () => void
  stop: (id: string) => Promise<void>
  approve: (id: string) => Promise<{ success: boolean; results: string[] }>
  reject: (id: string) => Promise<void>
  continueDiscussion: (id: string) => Promise<void>
  sendChatMessage: (id: string, message: string) => Promise<void>
  generateProposal: (id: string) => Promise<void>
}

export const useDiscussionStore = create<DiscussionState>((set, get) => ({
  discussions: [],
  current: null,
  liveMessages: [],
  streamingParticipantId: null,
  streamingText: '',
  currentRound: 0,
  liveStatus: null,
  consensus: null,
  proposal: null,
  loading: false,
  error: null,
  unsubWs: null,

  fetchAll: async () => {
    set({ loading: true, error: null })
    try {
      const list = await api.listDiscussions()
      set({ discussions: list, loading: false })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '加载失败', loading: false })
    }
  },

  fetchDetail: async (id) => {
    set({ loading: true, error: null })
    try {
      const detail = await api.getDiscussion(id)
      set({
        current: detail,
        liveMessages: detail.rounds.flatMap((r) => r.messages),
        consensus: detail.consensus || null,
        proposal: detail.proposal || null,
        liveStatus: detail.status,
        loading: false,
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '加载失败', loading: false })
    }
  },

  create: async (data) => {
    const discussion = await api.createDiscussion(data)
    set({ discussions: [discussion, ...get().discussions] })
    return discussion
  },

  subscribeLive: (id) => {
    // 先取消旧订阅
    get().unsubscribeLive()

    // 连接 WebSocket
    wsClient.connect(id)

    const unsub = wsClient.on((event: WsEvent) => {
      switch (event.type) {
        case 'discussion:round-start':
          set({ currentRound: event.data.round })
          break
        case 'discussion:message-start':
          set({
            streamingParticipantId: event.data.participantId,
            streamingText: '',
          })
          break
        case 'discussion:message-chunk':
          set((state) => ({
            streamingText: state.streamingText + event.data.chunk,
          }))
          break
        case 'discussion:message-end': {
          const msg = event.data.message as DiscussionMessage
          set((state) => ({
            liveMessages: [...state.liveMessages, msg],
            streamingParticipantId: null,
            streamingText: '',
          }))
          break
        }
        case 'discussion:consensus':
          set({ consensus: event.data.consensus })
          break
        case 'discussion:proposal':
          set({ proposal: event.data.proposal })
          break
        case 'discussion:status':
          set({ liveStatus: event.data.status })
          break
        case 'discussion:done':
          // 重新拉取完整数据
          get().fetchDetail(id)
          break
        case 'discussion:error':
          set({ error: event.data.error })
          break
      }
    })

    set({ unsubWs: unsub })
  },

  unsubscribeLive: () => {
    const { unsubWs } = get()
    if (unsubWs) {
      unsubWs()
      set({ unsubWs: null })
    }
    wsClient.disconnect()
    set({
      streamingParticipantId: null,
      streamingText: '',
    })
  },

  stop: async (id) => {
    await api.stopDiscussion(id)
    set({ liveStatus: 'rejected' })
  },

  approve: async (id) => {
    const result = await api.approveProposal(id)
    set({ liveStatus: 'done' })
    return result
  },

  reject: async (id) => {
    await api.rejectProposal(id)
    set({ liveStatus: 'rejected', proposal: null })
  },

  continueDiscussion: async (id) => {
    await api.continueDiscussion(id)
    set({ liveStatus: 'discussing', proposal: null, consensus: null })
  },

  sendChatMessage: async (id, message) => {
    await api.sendChatMessage(id, message)
  },

  generateProposal: async (id) => {
    set({ liveStatus: 'proposing' })
    await api.generateProposal(id)
  },
}))
