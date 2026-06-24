// Discussion 路由 - 讨论会话管理
import { Router, type Request, type Response } from 'express'
import { discussionStore, proposalStore, projectStore, participantStore } from '../db/store.js'
import { applyChanges } from '../fs/projectFs.js'
import { runDiscussion } from '../discussion/engine.js'
import { handleChatMessage, generateProposalFromChat } from '../discussion/chatEngine.js'
import { broadcast } from '../ws/eventBus.js'

const router = Router()

// 列表
router.get('/', (_req: Request, res: Response) => {
  const list = discussionStore.list().sort((a, b) => b.updatedAt - a.updatedAt)
  res.json({ success: true, data: list })
})

// 详情
router.get('/:id', (req: Request, res: Response) => {
  const item = discussionStore.get(req.params.id)
  if (!item) {
    res.status(404).json({ success: false, error: '未找到讨论' })
    return
  }
  const proposal = proposalStore.getByDiscussion(req.params.id)
  res.json({ success: true, data: { ...item, proposal } })
})

// 创建并启动讨论
router.post('/', async (req: Request, res: Response) => {
  const { projectId, topic, context, participantIds, maxRounds, mode } = req.body
  if (!projectId || !topic || !participantIds?.length) {
    res.status(400).json({ success: false, error: '缺少必填字段' })
    return
  }
  const project = projectStore.get(projectId)
  if (!project) {
    res.status(404).json({ success: false, error: '项目不存在' })
    return
  }
  const participants = participantIds
    .map((id: string) => participantStore.get(id))
    .filter(Boolean)
  if (participants.length < 2) {
    res.status(400).json({ success: false, error: '至少需要2个AI参与讨论' })
    return
  }

  const discussionMode = mode || 'roundtable'
  const discussion = discussionStore.create({
    projectId,
    topic,
    context: context || { filePaths: [], instruction: '' },
    participantIds,
    rounds: [],
    status: discussionMode === 'chat' ? 'discussing' : 'discussing',
    mode: discussionMode,
    maxRounds: maxRounds || 3,
    currentRound: 0,
  })

  // 圆桌模式: 自动启动讨论引擎
  // 聊天模式: 等待用户发消息,不自动启动
  if (discussionMode === 'roundtable') {
    runDiscussion(discussion.id).catch((err) => {
      console.error('讨论引擎错误:', err)
      discussionStore.update(discussion.id, { status: 'rejected' })
    })
  }

  res.json({ success: true, data: discussion })
})

// 聊天模式: 用户发送消息
router.post('/:id/chat', async (req: Request, res: Response) => {
  const { message } = req.body
  if (!message?.trim()) {
    res.status(400).json({ success: false, error: '消息不能为空' })
    return
  }
  const discussion = discussionStore.get(req.params.id)
  if (!discussion) {
    res.status(404).json({ success: false, error: '未找到讨论' })
    return
  }
  if (discussion.mode !== 'chat') {
    res.status(400).json({ success: false, error: '该讨论不是聊天模式' })
    return
  }
  if (discussion.status === 'rejected') {
    res.status(400).json({ success: false, error: '讨论已终止' })
    return
  }

  // 异步处理,AI轮流回复通过 WebSocket 推送
  handleChatMessage(req.params.id, message.trim()).catch((err) => {
    console.error('聊天引擎错误:', err)
    broadcast(req.params.id, 'discussion:error', { error: String(err) })
  })

  res.json({ success: true })
})

// 聊天模式: 手动生成方案
router.post('/:id/generate-proposal', async (req: Request, res: Response) => {
  const discussion = discussionStore.get(req.params.id)
  if (!discussion) {
    res.status(404).json({ success: false, error: '未找到讨论' })
    return
  }
  if (discussion.mode !== 'chat') {
    res.status(400).json({ success: false, error: '该讨论不是聊天模式' })
    return
  }

  generateProposalFromChat(req.params.id).catch((err) => {
    console.error('方案生成错误:', err)
  })

  res.json({ success: true })
})

// 终止讨论
router.post('/:id/stop', (req: Request, res: Response) => {
  const item = discussionStore.update(req.params.id, { status: 'rejected' })
  res.json({ success: true, data: item })
})

// 批准方案
router.post('/:id/approve', (req: Request, res: Response) => {
  const discussion = discussionStore.get(req.params.id)
  if (!discussion) {
    res.status(404).json({ success: false, error: '未找到讨论' })
    return
  }
  const proposal = proposalStore.getByDiscussion(req.params.id)
  if (!proposal) {
    res.status(404).json({ success: false, error: '未找到修改方案' })
    return
  }

  const project = projectStore.get(discussion.projectId)
  if (!project) {
    res.status(404).json({ success: false, error: '项目不存在' })
    return
  }

  discussionStore.update(req.params.id, { status: 'executing' })
  const result = applyChanges(project.path, proposal.changes)
  proposalStore.update(proposal.id, { status: 'executed' })
  discussionStore.update(req.params.id, { status: 'done' })

  res.json({ success: result.success, data: result })
})

// 拒绝方案
router.post('/:id/reject', (req: Request, res: Response) => {
  const discussion = discussionStore.get(req.params.id)
  if (!discussion) {
    res.status(404).json({ success: false, error: '未找到讨论' })
    return
  }
  const proposal = proposalStore.getByDiscussion(req.params.id)
  if (proposal) {
    proposalStore.update(proposal.id, { status: 'rejected' })
  }
  discussionStore.update(req.params.id, { status: 'rejected' })
  res.json({ success: true })
})

// 重新讨论(拒绝后继续)
router.post('/:id/continue', async (req: Request, res: Response) => {
  const discussion = discussionStore.get(req.params.id)
  if (!discussion) {
    res.status(404).json({ success: false, error: '未找到讨论' })
    return
  }
  discussionStore.update(req.params.id, { status: 'discussing' })
  if (discussion.mode === 'roundtable') {
    runDiscussion(discussion.id).catch((err) => {
      console.error('讨论引擎错误:', err)
    })
  }
  res.json({ success: true })
})

export default router
