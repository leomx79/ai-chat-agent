// JSON 文件数据存储层
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { nanoid } from 'nanoid'
import { decrypt, encrypt } from './crypto.js'
import type {
  Provider,
  Participant,
  Project,
  Discussion,
  Proposal,
} from '../../shared/types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DATA_DIR = path.join(__dirname, '../../.data')
const DATA_FILE = path.join(DATA_DIR, 'db.json')

interface DBSchema {
  providers: Provider[]
  participants: Participant[]
  projects: Project[]
  discussions: Discussion[]
  proposals: Proposal[]
}

function defaultData(): DBSchema {
  return {
    providers: [],
    participants: [],
    projects: [],
    discussions: [],
    proposals: [],
  }
}

let cache: DBSchema | null = null
let writeTimer: NodeJS.Timeout | null = null

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function readRaw(): DBSchema {
  ensureDir()
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData(), null, 2), 'utf8')
    return defaultData()
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8')
    const data = { ...defaultData(), ...JSON.parse(raw) }
    return data
  } catch {
    return defaultData()
  }
}

function load(): DBSchema {
  if (!cache) {
    cache = readRaw()
    // 解密 provider 的 apiKey
    cache.providers = cache.providers.map((p) => ({
      ...p,
      apiKey: p.apiKey ? decrypt(p.apiKey) : '',
    }))
  }
  return cache
}

// 防抖写入
function scheduleWrite() {
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    writeTimer = null
    persist()
  }, 100)
}

function persist() {
  if (!cache) return
  ensureDir()
  // 加密 provider 的 apiKey 后写入
  const toWrite: DBSchema = {
    ...cache,
    providers: cache.providers.map((p) => ({
      ...p,
      apiKey: p.apiKey ? encrypt(p.apiKey) : '',
    })),
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(toWrite, null, 2), 'utf8')
}

export function genId(): string {
  return nanoid(12)
}

// ============ Provider ============
export const providerStore = {
  list: (): Provider[] => load().providers,
  get: (id: string): Provider | undefined => load().providers.find((p) => p.id === id),
  create: (data: Omit<Provider, 'id' | 'createdAt'>): Provider => {
    const db = load()
    const item: Provider = { ...data, id: genId(), createdAt: Date.now() }
    db.providers.push(item)
    scheduleWrite()
    return item
  },
  update: (id: string, data: Partial<Provider>): Provider | undefined => {
    const db = load()
    const idx = db.providers.findIndex((p) => p.id === id)
    if (idx === -1) return undefined
    db.providers[idx] = { ...db.providers[idx], ...data, id }
    scheduleWrite()
    return db.providers[idx]
  },
  remove: (id: string): boolean => {
    const db = load()
    const before = db.providers.length
    db.providers = db.providers.filter((p) => p.id !== id)
    if (db.providers.length !== before) {
      scheduleWrite()
      return true
    }
    return false
  },
}

// ============ Participant ============
export const participantStore = {
  list: (): Participant[] => load().participants,
  get: (id: string): Participant | undefined => load().participants.find((p) => p.id === id),
  create: (data: Omit<Participant, 'id' | 'createdAt'>): Participant => {
    const db = load()
    const item: Participant = { ...data, id: genId(), createdAt: Date.now() }
    db.participants.push(item)
    scheduleWrite()
    return item
  },
  update: (id: string, data: Partial<Participant>): Participant | undefined => {
    const db = load()
    const idx = db.participants.findIndex((p) => p.id === id)
    if (idx === -1) return undefined
    db.participants[idx] = { ...db.participants[idx], ...data, id }
    scheduleWrite()
    return db.participants[idx]
  },
  remove: (id: string): boolean => {
    const db = load()
    const before = db.participants.length
    db.participants = db.participants.filter((p) => p.id !== id)
    if (db.participants.length !== before) {
      scheduleWrite()
      return true
    }
    return false
  },
}

// ============ Project ============
export const projectStore = {
  list: (): Project[] => load().projects,
  get: (id: string): Project | undefined => load().projects.find((p) => p.id === id),
  create: (data: Omit<Project, 'id' | 'createdAt'>): Project => {
    const db = load()
    const item: Project = { ...data, id: genId(), createdAt: Date.now() }
    db.projects.push(item)
    scheduleWrite()
    return item
  },
  update: (id: string, data: Partial<Project>): Project | undefined => {
    const db = load()
    const idx = db.projects.findIndex((p) => p.id === id)
    if (idx === -1) return undefined
    db.projects[idx] = { ...db.projects[idx], ...data, id }
    scheduleWrite()
    return db.projects[idx]
  },
  remove: (id: string): boolean => {
    const db = load()
    const before = db.projects.length
    db.projects = db.projects.filter((p) => p.id !== id)
    if (db.projects.length !== before) {
      scheduleWrite()
      return true
    }
    return false
  },
}

// ============ Discussion ============
export const discussionStore = {
  list: (): Discussion[] => load().discussions,
  get: (id: string): Discussion | undefined => load().discussions.find((d) => d.id === id),
  create: (data: Omit<Discussion, 'id' | 'createdAt' | 'updatedAt'>): Discussion => {
    const db = load()
    const now = Date.now()
    const item: Discussion = { ...data, id: genId(), createdAt: now, updatedAt: now }
    db.discussions.push(item)
    scheduleWrite()
    return item
  },
  update: (id: string, data: Partial<Discussion>): Discussion | undefined => {
    const db = load()
    const idx = db.discussions.findIndex((d) => d.id === id)
    if (idx === -1) return undefined
    db.discussions[idx] = { ...db.discussions[idx], ...data, id, updatedAt: Date.now() }
    scheduleWrite()
    return db.discussions[idx]
  },
  remove: (id: string): boolean => {
    const db = load()
    const before = db.discussions.length
    db.discussions = db.discussions.filter((d) => d.id !== id)
    if (db.discussions.length !== before) {
      scheduleWrite()
      return true
    }
    return false
  },
}

// ============ Proposal ============
export const proposalStore = {
  list: (): Proposal[] => load().proposals,
  get: (id: string): Proposal | undefined => load().proposals.find((p) => p.id === id),
  getByDiscussion: (discussionId: string): Proposal | undefined =>
    load().proposals.find((p) => p.discussionId === discussionId),
  create: (data: Omit<Proposal, 'id' | 'createdAt'>): Proposal => {
    const db = load()
    const item: Proposal = { ...data, id: genId(), createdAt: Date.now() }
    db.proposals.push(item)
    scheduleWrite()
    return item
  },
  update: (id: string, data: Partial<Proposal>): Proposal | undefined => {
    const db = load()
    const idx = db.proposals.findIndex((p) => p.id === id)
    if (idx === -1) return undefined
    db.proposals[idx] = { ...db.proposals[idx], ...data, id }
    scheduleWrite()
    return db.proposals[idx]
  },
}

// 强制立即写入(用于关键操作后)
export function flush() {
  if (writeTimer) {
    clearTimeout(writeTimer)
    writeTimer = null
  }
  persist()
}
