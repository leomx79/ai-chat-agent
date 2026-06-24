// 项目状态管理
import { create } from 'zustand'
import { api } from '@/services/api'
import type { Project, FileNode } from '../../shared/types'

interface ProjectState {
  projects: Project[]
  currentProject: Project | null
  tree: FileNode | null
  fileContent: string
  selectedFile: string | null
  loading: boolean
  error: string | null
  fetchAll: () => Promise<void>
  create: (data: Partial<Project>) => Promise<Project>
  update: (id: string, data: Partial<Project>) => Promise<void>
  remove: (id: string) => Promise<void>
  selectProject: (project: Project) => void
  fetchTree: (id: string) => Promise<void>
  readFile: (id: string, path: string) => Promise<void>
  setSelectedFile: (path: string | null) => void
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  tree: null,
  fileContent: '',
  selectedFile: null,
  loading: false,
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null })
    try {
      const list = await api.listProjects()
      set({ projects: list, loading: false })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '加载失败', loading: false })
    }
  },

  create: async (data) => {
    const item = await api.createProject(data)
    set({ projects: [...get().projects, item] })
    return item
  },

  update: async (id, data) => {
    const item = await api.updateProject(id, data)
    set({
      projects: get().projects.map((p) => (p.id === id ? item : p)),
    })
  },

  remove: async (id) => {
    await api.deleteProject(id)
    set({ projects: get().projects.filter((p) => p.id !== id) })
  },

  selectProject: (project) => set({ currentProject: project, tree: null, fileContent: '', selectedFile: null }),

  fetchTree: async (id) => {
    try {
      const tree = await api.getTree(id)
      set({ tree })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '读取文件树失败' })
    }
  },

  readFile: async (id, path) => {
    set({ selectedFile: path })
    try {
      const content = await api.readFile(id, path)
      set({ fileContent: content })
    } catch (err) {
      set({ fileContent: '', error: err instanceof Error ? err.message : '读取文件失败' })
    }
  },

  setSelectedFile: (path) => set({ selectedFile: path }),
}))
