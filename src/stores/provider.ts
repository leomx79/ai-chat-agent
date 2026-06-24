// 提供商状态管理
import { create } from 'zustand'
import { api } from '@/services/api'
import type { Provider, ModelInfo } from '../../shared/types'

interface ProviderState {
  providers: Provider[]
  loading: boolean
  error: string | null
  fetchAll: () => Promise<void>
  create: (data: Partial<Provider>) => Promise<Provider>
  update: (id: string, data: Partial<Provider>) => Promise<void>
  remove: (id: string) => Promise<void>
  fetchModels: (id: string) => Promise<ModelInfo[]>
  test: (id: string) => Promise<{ ok: boolean; message: string }>
}

export const useProviderStore = create<ProviderState>((set, get) => ({
  providers: [],
  loading: false,
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null })
    try {
      const list = await api.listProviders()
      set({ providers: list, loading: false })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '加载失败', loading: false })
    }
  },

  create: async (data) => {
    const item = await api.createProvider(data)
    set({ providers: [...get().providers, item] })
    return item
  },

  update: async (id, data) => {
    const item = await api.updateProvider(id, data)
    set({
      providers: get().providers.map((p) => (p.id === id ? item : p)),
    })
  },

  remove: async (id) => {
    await api.deleteProvider(id)
    set({ providers: get().providers.filter((p) => p.id !== id) })
  },

  fetchModels: async (id) => {
    const models = await api.fetchModels(id)
    const item = get().providers.find((p) => p.id === id)
    if (item) {
      const updated = { ...item, models }
      set({
        providers: get().providers.map((p) => (p.id === id ? updated : p)),
      })
    }
    return models
  },

  test: async (id) => {
    return api.testProvider(id)
  },
}))
