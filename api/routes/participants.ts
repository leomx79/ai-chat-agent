// Participant 路由 - AI 参与方管理
import { Router, type Request, type Response } from 'express'
import { participantStore, providerStore } from '../db/store.js'

const router = Router()

// 角色预设模板
const ROLE_PRESETS = [
  {
    name: '架构师',
    systemPrompt:
      '你是一位资深架构师。在讨论中,你关注整体架构设计、模块划分、技术选型和可扩展性。提出方案时务必引用项目中的具体代码,避免臆测。指出其他方案中的架构隐患。',
    color: '#6366f1',
  },
  {
    name: '审查员',
    systemPrompt:
      '你是一位严格的代码审查员。你的职责是审查其他AI提出的方案,重点检查:事实错误(幻觉)、与现有代码的矛盾、过度设计、潜在风险。必须引用具体代码行作为依据。对没有代码依据的论断提出质疑。',
    color: '#ef4444',
  },
  {
    name: '实现者',
    systemPrompt:
      '你是一位务实的实现工程师。你关注方案的可落地性,给出具体的代码实现建议。提出的修改必须基于项目现有代码结构,给出完整的文件路径和改动内容。注意细节和边界情况。',
    color: '#10b981',
  },
  {
    name: '产品顾问',
    systemPrompt:
      '你是一位产品思维顾问。你从用户需求和产品逻辑角度审视方案,确保修改不会破坏现有功能,关注用户体验和向后兼容性。引用具体功能代码作为讨论依据。',
    color: '#f59e0b',
  },
]

router.get('/', (_req: Request, res: Response) => {
  const list = participantStore.list()
  res.json({ success: true, data: list })
})

router.get('/presets', (_req: Request, res: Response) => {
  res.json({ success: true, data: ROLE_PRESETS })
})

router.get('/:id', (req: Request, res: Response) => {
  const item = participantStore.get(req.params.id)
  if (!item) {
    res.status(404).json({ success: false, error: '未找到AI参与方' })
    return
  }
  res.json({ success: true, data: item })
})

router.post('/', (req: Request, res: Response) => {
  const { name, avatar, color, providerId, model, systemPrompt, temperature, enabled } = req.body
  if (!name || !providerId || !model) {
    res.status(400).json({ success: false, error: '缺少必填字段(名称、提供商、模型)' })
    return
  }
  const provider = providerStore.get(providerId)
  if (!provider) {
    res.status(400).json({ success: false, error: '提供商不存在' })
    return
  }
  const item = participantStore.create({
    name,
    avatar,
    color: color || '#6366f1',
    providerId,
    model,
    systemPrompt: systemPrompt || '',
    temperature: temperature ?? 0.7,
    enabled: enabled !== false,
  })
  res.json({ success: true, data: item })
})

router.put('/:id', (req: Request, res: Response) => {
  const item = participantStore.update(req.params.id, req.body)
  if (!item) {
    res.status(404).json({ success: false, error: '未找到AI参与方' })
    return
  }
  res.json({ success: true, data: item })
})

router.delete('/:id', (req: Request, res: Response) => {
  const ok = participantStore.remove(req.params.id)
  res.json({ success: ok })
})

export default router
