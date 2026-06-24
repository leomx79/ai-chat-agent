// 模型列表拉取
import type { Provider, ModelInfo } from '../../shared/types.js'

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

export async function fetchModels(provider: Provider): Promise<ModelInfo[]> {
  const base = normalizeBaseUrl(provider.baseUrl)

  if (provider.protocol === 'anthropic') {
    // Anthropic 模型列表
    const resp = await fetch(`${base}/models`, {
      headers: {
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
      },
    })
    if (!resp.ok) throw new Error(`拉取模型失败: ${resp.status}`)
    const json = await resp.json()
    const models: ModelInfo[] = (json.data || []).map((m: any) => ({
      id: m.id,
      name: m.display_name || m.id,
    }))
    return models
  }

  // OpenAI 兼容
  const resp = await fetch(`${base}/models`, {
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
    },
  })
  if (!resp.ok) throw new Error(`拉取模型失败: ${resp.status}`)
  const json = await resp.json()
  const models: ModelInfo[] = (json.data || []).map((m: any) => ({
    id: m.id,
    name: m.id,
  }))
  return models
}

// 测试连通性
export async function testConnection(provider: Provider): Promise<{ ok: boolean; message: string }> {
  try {
    const models = await fetchModels(provider)
    return { ok: true, message: `连接成功,共 ${models.length} 个可用模型` }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : '连接失败',
    }
  }
}
