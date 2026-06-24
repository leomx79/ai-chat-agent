// 扩展状态存储 - 使用 VS Code globalState + SecretStorage
import * as vscode from 'vscode'
import { nanoid } from 'nanoid'
import type { Provider, Participant, Discussion, Proposal } from '../../shared/types'

interface StoredData {
  providers: Provider[]
  participants: Participant[]
  discussions: Discussion[]
  proposals: Proposal[]
}

const DEFAULT_DATA: StoredData = {
  providers: [],
  participants: [],
  discussions: [],
  proposals: [],
}

export class StateStore {
  constructor(private context: vscode.ExtensionContext) {}

  private load(): StoredData {
    const raw = this.context.globalState.get<string>('ai-roundtable-data')
    if (!raw) return { ...DEFAULT_DATA }
    try {
      return { ...DEFAULT_DATA, ...JSON.parse(raw) }
    } catch {
      return { ...DEFAULT_DATA }
    }
  }

  private save(data: StoredData) {
    this.context.globalState.update('ai-roundtable-data', JSON.stringify(data))
  }

  // ============ Providers ============
  listProviders(): Provider[] {
    return this.load().providers
  }

  getProvider(id: string): Provider | undefined {
    return this.load().providers.find((p) => p.id === id)
  }

  async saveProvider(data: Partial<Provider> & { name: string; baseUrl: string; apiKey: string }): Promise<Provider> {
    const db = this.load()
    // API Key 存入 SecretStorage
    const keyId = data.id || nanoid(12)
    await this.context.secrets.store(`provider-${keyId}`, data.apiKey)

    if (data.id) {
      const idx = db.providers.findIndex((p) => p.id === data.id)
      if (idx !== -1) {
        db.providers[idx] = { ...db.providers[idx], ...data, id: data.id }
      }
    } else {
      db.providers.push({
        id: keyId,
        name: data.name,
        type: 'official',
        baseUrl: data.baseUrl,
        apiKey: '', // 不存在 data 里,运行时从 secrets 读取
        protocol: 'openai',
        models: data.models || [],
        createdAt: Date.now(),
      })
    }
    this.save(db)
    return db.providers.find((p) => p.id === keyId)!
  }

  async getProviderWithKey(id: string): Promise<Provider | undefined> {
    const p = this.getProvider(id)
    if (!p) return undefined
    const apiKey = await this.context.secrets.get(`provider-${id}`)
    return { ...p, apiKey: apiKey || '' }
  }

  deleteProvider(id: string): void {
    const db = this.load()
    db.providers = db.providers.filter((p) => p.id !== id)
    this.context.secrets.delete(`provider-${id}`)
    this.save(db)
  }

  // ============ Participants ============
  listParticipants(): Participant[] {
    return this.load().participants
  }

  getParticipant(id: string): Participant | undefined {
    return this.load().participants.find((p) => p.id === id)
  }

  saveParticipant(data: Partial<Participant> & { name: string; providerId: string; model: string }): Participant {
    const db = this.load()
    if (data.id) {
      const idx = db.participants.findIndex((p) => p.id === data.id)
      if (idx !== -1) {
        db.participants[idx] = { ...db.participants[idx], ...data, id: data.id }
        this.save(db)
        return db.participants[idx]
      }
    }
    const item: Participant = {
      id: nanoid(12),
      name: data.name,
      color: data.color || '#6366f1',
      providerId: data.providerId,
      model: data.model,
      systemPrompt: data.systemPrompt || '',
      temperature: data.temperature ?? 0.7,
      enabled: data.enabled !== false,
      createdAt: Date.now(),
    }
    db.participants.push(item)
    this.save(db)
    return item
  }

  deleteParticipant(id: string): void {
    const db = this.load()
    db.participants = db.participants.filter((p) => p.id !== id)
    this.save(db)
  }

  // ============ Discussions ============
  listDiscussions(): Discussion[] {
    return this.load().discussions.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  getDiscussion(id: string): Discussion | undefined {
    return this.load().discussions.find((d) => d.id === id)
  }

  saveDiscussion(data: Partial<Discussion> & { id: string }): Discussion {
    const db = this.load()
    const idx = db.discussions.findIndex((d) => d.id === data.id)
    if (idx !== -1) {
      db.discussions[idx] = { ...db.discussions[idx], ...data, updatedAt: Date.now() }
    } else {
      db.discussions.push({
        id: data.id,
        projectId: data.projectId || '',
        topic: data.topic || '',
        context: data.context || { filePaths: [], instruction: '' },
        participantIds: data.participantIds || [],
        rounds: data.rounds || [],
        status: data.status || 'discussing',
        mode: data.mode || 'roundtable',
        maxRounds: data.maxRounds || 3,
        currentRound: data.currentRound || 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as Discussion)
    }
    this.save(db)
    return db.discussions.find((d) => d.id === data.id)!
  }

  deleteDiscussion(id: string): void {
    const db = this.load()
    db.discussions = db.discussions.filter((d) => d.id !== id)
    this.save(db)
  }

  // ============ Proposals ============
  getProposalByDiscussion(discussionId: string): Proposal | undefined {
    return this.load().proposals.find((p) => p.discussionId === discussionId)
  }

  saveProposal(data: Proposal): void {
    const db = this.load()
    const idx = db.proposals.findIndex((p) => p.id === data.id)
    if (idx !== -1) {
      db.proposals[idx] = data
    } else {
      db.proposals.push(data)
    }
    this.save(db)
  }
}
