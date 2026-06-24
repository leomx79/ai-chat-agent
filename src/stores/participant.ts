// AI 参与方状态管理
import { create } from 'zustand'
import { api } from '@/services/api'
import type { Participant, RolePreset } from '../../shared/types'

interface ParticipantState {
  participants: Participant[]
  presets: RolePreset[]
  loading: boolean
  error: string | null
  fetchAll: () => Promise<void>
  fetchPresets: () => Promise<void>
  create: (data: Partial<Participant>) => Promise<Participant>
  update: (id: string, data: Partial<Participant>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useParticipantStore = create<ParticipantState>((set, get) => ({
  participants: [],
  presets: [],
  loading: false,
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null })
    try {
      const list = await api.listParticipants()
      set({ participants: list, loading: false })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '加载失败', loading: false })
    }
  },

  fetchPresets: async () => {
    try {
      const presets = await api.getPresets()
      set({ presets })
    } catch {
      // 忽略
    }
  },

  create: async (data) => {
    const item = await api.createParticipant(data)
    set({ participants: [...get().participants, item] })
    return item
  },

  update: async (id, data) => {
    const item = await api.updateParticipant(id, data)
    set({
      participants: get().participants.map((p) => (p.id === id ? item : p)),
    })
  },

  remove: async (id) => {
    await api.deleteParticipant(id)
    set({ participants: get().participants.filter((p) => p.id !== id) })
  },
}))
