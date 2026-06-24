// LLM 提供商适配层 - 统一流式 chat 接口
import type { ChatMessage, ChatOptions, Provider, ProtocolType } from '../../shared/types.js'

export interface StreamCallbacks {
  onStart?: () => void
  onChunk?: (chunk: string) => void
  onEnd?: (fullText: string) => void
  onError?: (err: Error) => void
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

// ============ OpenAI 兼容协议 ============
async function streamOpenAI(
  provider: Provider,
  messages: ChatMessage[],
  options: ChatOptions,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<string> {
  const base = normalizeBaseUrl(provider.baseUrl)
  const url = `${base}/chat/completions`

  const body: Record<string, unknown> = {
    model: options.model,
    messages,
    stream: true,
    temperature: options.temperature ?? 0.7,
  }
  if (options.maxTokens) body.max_tokens = options.maxTokens

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
    throw new Error(`OpenAI API 错误 ${resp.status}: ${errText.slice(0, 500)}`)
  }

  callbacks.onStart?.()
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
      if (!trimmed || !trimmed.startsWith('data:')) continue
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
        // 忽略解析错误的行
      }
    }
  }

  callbacks.onEnd?.(fullText)
  return fullText
}

// ============ Anthropic 原生协议 ============
async function streamAnthropic(
  provider: Provider,
  messages: ChatMessage[],
  options: ChatOptions,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<string> {
  const base = normalizeBaseUrl(provider.baseUrl)
  const url = `${base}/messages`

  // Anthropic: system 单独传, messages 只含 user/assistant
  const systemMsg = messages.find((m) => m.role === 'system')
  const chatMessages = messages.filter((m) => m.role !== 'system')

  const body: Record<string, unknown> = {
    model: options.model,
    messages: chatMessages,
    stream: true,
    max_tokens: options.maxTokens ?? 4096,
  }
  if (systemMsg) body.system = systemMsg.content
  if (options.temperature !== undefined) body.temperature = options.temperature

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': provider.apiKey,
    'anthropic-version': '2023-06-01',
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })

  if (!resp.ok || !resp.body) {
    const errText = await resp.text().catch(() => '')
    throw new Error(`Anthropic API 错误 ${resp.status}: ${errText.slice(0, 500)}`)
  }

  callbacks.onStart?.()
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
      try {
        const json = JSON.parse(data)
        if (json.type === 'content_block_delta' && json.delta?.text) {
          fullText += json.delta.text
          callbacks.onChunk?.(json.delta.text)
        }
      } catch {
        // 忽略
      }
    }
  }

  callbacks.onEnd?.(fullText)
  return fullText
}

// ============ 统一入口 ============
export async function streamChat(
  provider: Provider,
  messages: ChatMessage[],
  options: ChatOptions,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<string> {
  // 组装最终消息(含 systemPrompt)
  const finalMessages: ChatMessage[] = []
  if (options.systemPrompt) {
    finalMessages.push({ role: 'system', content: options.systemPrompt })
  }
  finalMessages.push(...messages)

  const protocol: ProtocolType = provider.protocol

  try {
    if (protocol === 'anthropic') {
      return await streamAnthropic(provider, finalMessages, options, callbacks, signal)
    }
    // 默认 openai 兼容(中转站、官方、大多数 coding plan)
    return await streamOpenAI(provider, finalMessages, options, callbacks, signal)
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    callbacks.onError?.(error)
    throw error
  }
}

// 非流式调用(用于内部判断,如收敛检测)
export async function chat(
  provider: Provider,
  messages: ChatMessage[],
  options: ChatOptions,
): Promise<string> {
  let fullText = ''
  await streamChat(provider, messages, options, {
    onChunk: (c) => {
      fullText += c
    },
  })
  return fullText
}
