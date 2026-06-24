// Provider 路由 - API 提供商管理
import { Router, type Request, type Response } from 'express'
import { providerStore } from '../db/store.js'
import { fetchModels, testConnection } from '../llm/models.js'
import type { Provider } from '../../shared/types.js'

const router = Router()

// 列表
router.get('/', (_req: Request, res: Response) => {
  const list = providerStore.list()
  res.json({ success: true, data: list })
})

// 详情
router.get('/:id', (req: Request, res: Response) => {
  const item = providerStore.get(req.params.id)
  if (!item) {
    res.status(404).json({ success: false, error: '未找到提供商' })
    return
  }
  res.json({ success: true, data: item })
})

// 创建
router.post('/', (req: Request, res: Response) => {
  const { name, type, baseUrl, apiKey, protocol, models, defaultModel } = req.body
  if (!name || !baseUrl || !apiKey) {
    res.status(400).json({ success: false, error: '缺少必填字段' })
    return
  }
  const item = providerStore.create({
    name,
    type: type || 'relay',
    baseUrl,
    apiKey,
    protocol: protocol || 'openai',
    models: models || [],
    defaultModel,
  })
  res.json({ success: true, data: item })
})

// 更新
router.put('/:id', (req: Request, res: Response) => {
  const item = providerStore.update(req.params.id, req.body)
  if (!item) {
    res.status(404).json({ success: false, error: '未找到提供商' })
    return
  }
  res.json({ success: true, data: item })
})

// 删除
router.delete('/:id', (req: Request, res: Response) => {
  const ok = providerStore.remove(req.params.id)
  res.json({ success: ok })
})

// 拉取模型列表
router.post('/:id/models', async (req: Request, res: Response) => {
  const provider = providerStore.get(req.params.id)
  if (!provider) {
    res.status(404).json({ success: false, error: '未找到提供商' })
    return
  }
  // 允许传入临时配置(未保存时测试)
  const tempProvider: Provider = { ...provider, ...req.body }
  try {
    const models = await fetchModels(tempProvider)
    // 保存到 provider
    providerStore.update(req.params.id, { models })
    res.json({ success: true, data: models })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : '拉取模型失败',
    })
  }
})

// 连通性测试
router.post('/:id/test', async (req: Request, res: Response) => {
  const provider = providerStore.get(req.params.id)
  if (!provider) {
    res.status(404).json({ success: false, error: '未找到提供商' })
    return
  }
  const tempProvider: Provider = { ...provider, ...req.body }
  const result = await testConnection(tempProvider)
  res.json({ success: true, data: result })
})

// 临时测试(未保存的配置)
router.post('/test', async (req: Request, res: Response) => {
  const { baseUrl, apiKey, protocol } = req.body
  const tempProvider: Provider = {
    id: 'temp',
    name: 'temp',
    type: 'relay',
    baseUrl,
    apiKey,
    protocol: protocol || 'openai',
    models: [],
    createdAt: Date.now(),
  }
  const result = await testConnection(tempProvider)
  res.json({ success: true, data: result })
})

export default router
