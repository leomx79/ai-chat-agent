// 聊天模式引擎 - 用户发消息,多个AI轮流回复
import { nanoid } from 'nanoid'
import {
  discussionStore,
  participantStore,
  providerStore,
  projectStore,
  proposalStore,
} from '../db/store.js'
import { streamChat } from '../llm/adapter.js'
import { readFiles, readFile, createDiff } from '../fs/projectFs.js'
import { broadcast } from '../ws/eventBus.js'
import { proposalPrompt } from './prompts.js'
import type {
  Discussion,
  DiscussionMessage,
  MessageType,
  Participant,
  FileChange,
} from '../../shared/types.js'

function makeMessage(
  round: number,
  participantId: string,
  participantName: string,
  role: 'user' | 'assistant',
  content: string,
  type: MessageType,
): DiscussionMessage {
  return {
    id: nanoid(12),
    round,
    participantId,
    participantName,
    role,
    content,
    type,
    timestamp: Date.now(),
  }
}

// 构建聊天历史(供AI参考)
function buildChatHistory(discussion: Discussion): string {
  let text = ''
  for (const round of discussion.rounds) {
    for (const msg of round.messages) {
      const speaker = msg.role === 'user' ? '用户' : msg.participantName
      text += `\n**[${speaker}]**:\n${msg.content}\n`
    }
  }
  return text
}

function isStopped(discussionId: string): boolean {
  const d = discussionStore.get(discussionId)
  return !d || d.status === 'rejected'
}

// 用户发消息后,AI轮流回复
export async function handleChatMessage(discussionId: string, userMessage: string): Promise<void> {
  const discussion = discussionStore.get(discussionId)
  if (!discussion || discussion.mode !== 'chat') return

  const project = projectStore.get(discussion.projectId)
  if (!project) {
    broadcast(discussionId, 'discussion:error', { error: '项目不存在' })
    return
  }

  const participants = discussion.participantIds
    .map((id) => participantStore.get(id))
    .filter((p): p is Participant => !!p && p.enabled)

  if (participants.length === 0) {
    broadcast(discussionId, 'discussion:error', { error: '没有可用的AI参与方' })
    return
  }

  const fileContents = readFiles(project.path, discussion.context.filePaths)

  // 当前轮次(每轮 = 1条用户消息 + N条AI回复)
  const chatRound = discussion.rounds.length
  if (!discussion.rounds[chatRound]) {
    discussion.rounds[chatRound] = { index: chatRound, phase: 'lead', messages: [] }
  }

  // 保存用户消息
  const userMsg = makeMessage(chatRound, 'user', '用户', 'user', userMessage, 'user')
  discussion.rounds[chatRound].messages.push(userMsg)

  discussionStore.update(discussionId, {
    rounds: [...discussion.rounds],
    currentRound: chatRound + 1,
  })

  broadcast(discussionId, 'discussion:message-end', {
    participantId: 'user',
    round: chatRound,
    message: userMsg,
  })

  // 构建所有历史消息(含当前用户消息)
  const updatedDiscussion = discussionStore.get(discussionId)!
  const chatHistory = buildChatHistory(updatedDiscussion)

  // 每个AI轮流回复
  for (const participant of participants) {
    if (isStopped(discussionId)) return

    const provider = providerStore.get(participant.providerId)
    if (!provider) continue

    broadcast(discussionId, 'discussion:message-start', {
      participantId: participant.id,
      participantName: participant.name,
      round: chatRound,
      type: 'lead',
    })

    const system = `${participant.systemPrompt}

你正在参与一个多AI自由对话讨论。项目主题: ${discussion.topic}
${discussion.context.instruction ? `任务要求: ${discussion.context.instruction}` : ''}

规则:
1. 基于项目代码和对话历史回复,禁止臆测不存在的代码。
2. 从你的角色角度出发,给出专业见解。
3. 如果其他AI或用户说了不准确的内容,友善指出。
4. 保持简洁,聚焦当前话题。`

    const user = `## 项目代码
${Object.entries(fileContents).map(([f, c]) => `\n--- ${f} ---\n${c.slice(0, 6000)}`).join('')}

## 对话历史
${chatHistory}

## 请你作为「${participant.name}」回复:`

    let fullText = ''
    try {
      await streamChat(
        provider,
        [{ role: 'user', content: user }],
        {
          model: participant.model,
          temperature: participant.temperature,
          systemPrompt: system,
        },
        {
          onChunk: (chunk) => {
            fullText += chunk
            broadcast(discussionId, 'discussion:message-chunk', {
              participantId: participant.id,
              round: chatRound,
              chunk,
            })
          },
        },
      )
    } catch (err) {
      fullText = `[调用失败: ${err instanceof Error ? err.message : String(err)}]`
    }

    const aiMsg = makeMessage(chatRound, participant.id, participant.name, 'assistant', fullText, 'lead')
    const d = discussionStore.get(discussionId)!
    if (!d.rounds[chatRound]) d.rounds[chatRound] = { index: chatRound, phase: 'lead', messages: [] }
    d.rounds[chatRound].messages.push(aiMsg)

    discussionStore.update(discussionId, {
      rounds: [...d.rounds],
    })

    broadcast(discussionId, 'discussion:message-end', {
      participantId: participant.id,
      round: chatRound,
      message: aiMsg,
    })
  }

  broadcast(discussionId, 'discussion:round-end', { round: chatRound })
}

// 手动生成方案(聊天模式)
export async function generateProposalFromChat(discussionId: string): Promise<void> {
  const discussion = discussionStore.get(discussionId)
  if (!discussion) return

  const project = projectStore.get(discussion.projectId)
  if (!project) return

  const participants = discussion.participantIds
    .map((id) => participantStore.get(id))
    .filter((p): p is Participant => !!p && p.enabled)

  const moderator = participants[0]
  const moderatorProvider = moderator ? providerStore.get(moderator.providerId) : null
  if (!moderator || !moderatorProvider) {
    broadcast(discussionId, 'discussion:error', { error: '主持人提供商不可用' })
    return
  }

  const fileContents = readFiles(project.path, discussion.context.filePaths)
  const chatHistory = buildChatHistory(discussion)

  broadcast(discussionId, 'discussion:status', { status: 'proposing' })

  // 用对话历史作为"共识"输入方案生成
  const ctx = {
    topic: discussion.topic,
    instruction: discussion.context.instruction,
    fileContents,
    participantName: moderator.name,
  }

  const consensusSummary = `基于以下自由对话讨论,总结各方达成的共识:\n\n${chatHistory}`
  const pPrompt = proposalPrompt(ctx, consensusSummary)

  let proposalText = ''
  try {
    await streamChat(
      moderatorProvider,
      [{ role: 'user', content: pPrompt.user }],
      {
        model: moderator.model,
        temperature: 0.3,
        systemPrompt: pPrompt.system,
      },
      {
        onChunk: (chunk) => {
          proposalText += chunk
        },
      },
    )
  } catch (err) {
    broadcast(discussionId, 'discussion:error', {
      error: `方案生成失败: ${err instanceof Error ? err.message : String(err)}`,
    })
    return
  }

  // 解析方案 JSON
  const jsonMatch = proposalText.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : proposalText.trim()
  let parsed: { summary: string; changes: any[] }
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    try {
      const start = jsonStr.indexOf('{')
      const end = jsonStr.lastIndexOf('}')
      parsed = JSON.parse(jsonStr.slice(start, end + 1))
    } catch {
      parsed = { summary: '方案解析失败', changes: [] }
    }
  }

  const changes: FileChange[] = (parsed.changes || []).map((c: any) => {
    const change: FileChange = {
      id: nanoid(10),
      filePath: c.filePath || c.file || c.path || '',
      action: c.action || 'modify',
      content: c.content || '',
      reason: c.reason || '',
    }
    if (change.action === 'modify' && change.filePath) {
      try {
        const original = readFile(project.path, change.filePath)
        change.originalContent = original
        change.diff = createDiff(original, change.content, change.filePath)
      } catch {
        change.action = 'create'
      }
    }
    return change
  })

  const proposal = proposalStore.create({
    discussionId,
    summary: parsed.summary || '修改方案',
    changes,
    status: 'pending',
  })

  discussionStore.update(discussionId, {
    proposalId: proposal.id,
    status: 'reviewing',
  })

  broadcast(discussionId, 'discussion:proposal', { proposal })
  broadcast(discussionId, 'discussion:status', { status: 'reviewing' })
  broadcast(discussionId, 'discussion:done', {})
}
