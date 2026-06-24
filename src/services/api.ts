// REST API 客户端
import type {
  Provider,
  Participant,
  Project,
  Discussion,
  Proposal,
  FileNode,
  ModelInfo,
  RolePreset,
} from '../../shared/types'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const json = await resp.json()
  if (!json.success) throw new Error(json.error || '请求失败')
  return json.data as T
}

export const api = {
  // ============ Providers ============
  listProviders: () => request<Provider[]>('/api/providers'),
  getProvider: (id: string) => request<Provider>(`/api/providers/${id}`),
  createProvider: (data: Partial<Provider>) =>
    request<Provider>('/api/providers', { method: 'POST', body: JSON.stringify(data) }),
  updateProvider: (id: string, data: Partial<Provider>) =>
    request<Provider>(`/api/providers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProvider: (id: string) =>
    request<boolean>(`/api/providers/${id}`, { method: 'DELETE' }),
  fetchModels: (id: string) =>
    request<ModelInfo[]>(`/api/providers/${id}/models`, { method: 'POST' }),
  testProvider: (id: string) =>
    request<{ ok: boolean; message: string }>(`/api/providers/${id}/test`, { method: 'POST' }),
  testProviderTemp: (data: { baseUrl: string; apiKey: string; protocol: string }) =>
    request<{ ok: boolean; message: string }>('/api/providers/test', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ============ Participants ============
  listParticipants: () => request<Participant[]>('/api/participants'),
  getParticipant: (id: string) => request<Participant>(`/api/participants/${id}`),
  createParticipant: (data: Partial<Participant>) =>
    request<Participant>('/api/participants', { method: 'POST', body: JSON.stringify(data) }),
  updateParticipant: (id: string, data: Partial<Participant>) =>
    request<Participant>(`/api/participants/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteParticipant: (id: string) =>
    request<boolean>(`/api/participants/${id}`, { method: 'DELETE' }),
  getPresets: () => request<RolePreset[]>('/api/participants/presets'),

  // ============ Projects ============
  listProjects: () => request<Project[]>('/api/projects'),
  getProject: (id: string) => request<Project>(`/api/projects/${id}`),
  createProject: (data: Partial<Project>) =>
    request<Project>('/api/projects', { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (id: string, data: Partial<Project>) =>
    request<Project>(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProject: (id: string) =>
    request<boolean>(`/api/projects/${id}`, { method: 'DELETE' }),
  getTree: (id: string) => request<FileNode>(`/api/projects/${id}/tree`),
  readFile: (id: string, path: string) =>
    request<string>(`/api/projects/${id}/file?path=${encodeURIComponent(path)}`),
  browseDir: (dir?: string) =>
    request<{
      current: string
      parent: string | null
      dirs: { name: string; path: string; type: 'directory' }[]
      isGitRepo: boolean
    }>(`/api/projects/browse${dir ? `?dir=${encodeURIComponent(dir)}` : ''}`),
  gitClone: (data: { url: string; destDir: string; name?: string }) =>
    request<{ path: string; name: string }>('/api/projects/clone', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  gitStatus: () =>
    request<{ available: boolean; version: string | null }>('/api/projects/git-status'),

  // ============ Discussions ============
  listDiscussions: () => request<Discussion[]>('/api/discussions'),
  getDiscussion: (id: string) =>
    request<Discussion & { proposal?: Proposal }>(`/api/discussions/${id}`),
  createDiscussion: (data: {
    projectId: string
    topic: string
    context: { filePaths: string[]; instruction: string }
    participantIds: string[]
    maxRounds: number
    mode?: 'roundtable' | 'chat'
  }) =>
    request<Discussion>('/api/discussions', { method: 'POST', body: JSON.stringify(data) }),
  sendChatMessage: (id: string, message: string) =>
    request<boolean>(`/api/discussions/${id}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  generateProposal: (id: string) =>
    request<boolean>(`/api/discussions/${id}/generate-proposal`, { method: 'POST' }),
  stopDiscussion: (id: string) =>
    request<Discussion>(`/api/discussions/${id}/stop`, { method: 'POST' }),
  approveProposal: (id: string) =>
    request<{ success: boolean; results: string[] }>(`/api/discussions/${id}/approve`, {
      method: 'POST',
    }),
  rejectProposal: (id: string) =>
    request<boolean>(`/api/discussions/${id}/reject`, { method: 'POST' }),
  continueDiscussion: (id: string) =>
    request<boolean>(`/api/discussions/${id}/continue`, { method: 'POST' }),
}
