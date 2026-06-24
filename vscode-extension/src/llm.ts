// LLM 适配层 - 支持 OpenAI 兼容协议(DeepSeek 等) 和工具调用
import type { Provider, ChatMessage } from '../../shared/types'
import { toolDefinitions } from './tools'

export interface StreamCallbacks {
  onStart?: () => void
  onChunk?: (chunk: string) => void
  onToolCall?: (toolName: string, toolArgs: any) => void
  onEnd?: (fullText: string) => void
  onError?: (err: Error) => void
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

// 带 tool_use 的流式 chat (OpenAI 兼容 function calling)
export async function streamChatWithTools(
  provider: Provider,
  messages: any[],
  options: { model: string; temperature?: number; systemPrompt?: string },
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<{ text: string; toolCalls: { name: string; arguments: any }[]; reasoningContent?: string }> {
  const base = normalizeBaseUrl(provider.baseUrl)
  const url = `${base}/chat/completions`

  const finalMessages: any[] = []
  if (options.systemPrompt) {
    finalMessages.push({ role: 'system', content: options.systemPrompt })
  }
  // 直接传递完整消息对象(包含 tool_calls, tool_call_id 等)
  finalMessages.push(...messages)

  const body: Record<string, unknown> = {
    model: options.model,
    messages: finalMessages,
    stream: true,
    temperature: options.temperature ?? 0.7,
    tools: toolDefinitions.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    })),
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!resp.ok || !resp.body) {
    const errText = await resp.text().catch(() => '')
    throw new Error(`API 错误 ${resp.status}: ${errText.slice(0, 500)}`)
  }

  callbacks.onStart?.()
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''
  let reasoningContent = ''
  const toolCallMap = new Map<number, { name: string; args: string }>()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const json = JSON.parse(data)
        const delta = json.choices?.[0]?.delta
        // 捕获 reasoning_content (deepseek-reasoner 思考内容)
        if (delta?.reasoning_content) {
          reasoningContent += delta.reasoning_content
        }
        if (delta?.content) {
          fullText += delta.content
          callbacks.onChunk?.(delta.content)
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0
            if (!toolCallMap.has(idx)) {
              toolCallMap.set(idx, { name: tc.function?.name || '', args: '' })
            }
            const entry = toolCallMap.get(idx)!
            if (tc.function?.name) entry.name = tc.function.name
            if (tc.function?.arguments) entry.args += tc.function.arguments
          }
        }
      } catch {
        // 忽略解析错误
      }
    }
  }

  // 解析工具调用参数
  const toolCalls: { name: string; arguments: any }[] = []
  for (const entry of toolCallMap.values()) {
    try {
      const args = entry.args ? JSON.parse(entry.args) : {}
      toolCalls.push({ name: entry.name, arguments: args })
      callbacks.onToolCall?.(entry.name, args)
    } catch {
      toolCalls.push({ name: entry.name, arguments: {} })
    }
  }

  callbacks.onEnd?.(fullText)
  return { text: fullText, toolCalls, reasoningContent }
}

// 纯文本流式 chat(不带工具,用于共识/方案生成等)
export async function streamChat(
  provider: Provider,
  messages: ChatMessage[],
  options: { model: string; temperature?: number; systemPrompt?: string },
  callbacks: { onChunk?: (chunk: string) => void },
  signal?: AbortSignal,
): Promise<string> {
  const base = normalizeBaseUrl(provider.baseUrl)
  const url = `${base}/chat/completions`

  const finalMessages: any[] = []
  if (options.systemPrompt) {
    finalMessages.push({ role: 'system', content: options.systemPrompt })
  }
  finalMessages.push(...messages.map((m) => ({ role: m.role, content: m.content })))

  const body: Record<string, unknown> = {
    model: options.model,
    messages: finalMessages,
    stream: true,
    temperature: options.temperature ?? 0.7,
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!resp.ok || !resp.body) {
    const errText = await resp.text().catch(() => '')
    throw new Error(`API 错误 ${resp.status}: ${errText.slice(0, 500)}`)
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const json = JSON.parse(data)
        const delta = json.choices?.[0]?.delta?.content
        if (delta) {
          fullText += delta
          callbacks.onChunk?.(delta)
        }
      } catch {
        // 忽略
      }
    }
  }

  return fullText
}

// 拉取模型列表
export async function fetchModels(provider: Provider): Promise<{ id: string; name?: string }[]> {
  const base = normalizeBaseUrl(provider.baseUrl)
  const resp = await fetch(`${base}/models`, {
    headers: { Authorization: `Bearer ${provider.apiKey}` },
  })
  if (!resp.ok) throw new Error(`拉取模型失败: ${resp.status}`)
  const json: any = await resp.json()
  return (json.data || []).map((m: any) => ({ id: m.id, name: m.id }))
}
