// 讨论编排引擎 - 圆桌讨论 + 共识机制
// 流程: 项目熟悉 → 认知对齐 → 提案/互评(多轮) → 共识 → 方案
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
import {
  familiarizePrompt,
  alignPrompt,
  proposePrompt,
  critiquePrompt,
  consensusPrompt,
  proposalPrompt,
} from './prompts.js'
import type {
  Discussion,
  DiscussionMessage,
  MessageType,
  Participant,
  FileChange,
} from '../../shared/types.js'

// 构建前序消息摘要(供下一轮参考)
function buildPreviousMessages(discussion: Discussion, upToRound: number): string {
  let text = ''
  for (let r = 0; r <= upToRound && r < discussion.rounds.length; r++) {
    const round = discussion.rounds[r]
    text += `\n### ${roundPhaseLabel(round.phase, r)}\n`
    for (const msg of round.messages) {
      const typeLabel: Record<string, string> = {
        familiarize: '项目理解',
        align: '认知对齐',
        idea: '提案',
        critique: '质疑',
        refine: '完善',
        summary: '总结',
        system: '系统',
      }
      text += `\n**[${msg.participantName}] (${typeLabel[msg.type] || msg.type})**:\n${msg.content}\n`
    }
  }
  return text
}

function roundPhaseLabel(phase: string, round: number): string {
  switch (phase) {
    case 'familiarize': return '项目熟悉阶段'
    case 'align': return '认知对齐阶段'
    case 'propose': return `提案阶段(第${round}轮)`
    case 'critique': return `互评阶段(第${round}轮)`
    case 'refine': return `完善阶段(第${round}轮)`
    case 'converge': return '收敛阶段'
    default: return `第${round}轮`
  }
}

// 解析方案 JSON(容错处理 markdown 代码块)
function parseProposalJson(text: string): { summary: string; changes: any[] } {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim()

  try {
    const parsed = JSON.parse(jsonStr)
    return {
      summary: parsed.summary || '修改方案',
      changes: Array.isArray(parsed.changes) ? parsed.changes : [],
    }
  } catch {
    const start = jsonStr.indexOf('{')
    const end = jsonStr.lastIndexOf('}')
    if (start !== -1 && end !== -1) {
      try {
        const parsed = JSON.parse(jsonStr.slice(start, end + 1))
        return {
          summary: parsed.summary || '修改方案',
          changes: Array.isArray(parsed.changes) ? parsed.changes : [],
        }
      } catch {
        // 解析失败
      }
    }
  }
  return { summary: '方案解析失败,请重新讨论', changes: [] }
}

function makeMessage(
  round: number,
  participant: Participant,
  content: string,
  type: MessageType,
): DiscussionMessage {
  return {
    id: nanoid(12),
    round,
    participantId: participant.id,
    participantName: participant.name,
    role: 'assistant',
    content,
    type,
    timestamp: Date.now(),
  }
}

function isStopped(discussionId: string): boolean {
  const d = discussionStore.get(discussionId)
  return !d || d.status === 'rejected'
}

// 单个 AI 发言的通用流程
async function aiSpeak(
  discussionId: string,
  provider: NonNullable<ReturnType<typeof providerStore.get>>,
  participant: Participant,
  roundIdx: number,
  msgType: MessageType,
  system: string,
  user: string,
  rounds: Discussion['rounds'],
): Promise<DiscussionMessage> {
  broadcast(discussionId, 'discussion:message-start', {
    participantId: participant.id,
    participantName: participant.name,
    round: roundIdx,
    type: msgType,
  })

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
            round: roundIdx,
            chunk,
          })
        },
      },
    )
  } catch (err) {
    fullText = `[调用失败: ${err instanceof Error ? err.message : String(err)}]`
  }

  const message = makeMessage(roundIdx, participant, fullText, msgType)
  rounds[roundIdx].messages.push(message)

  discussionStore.update(discussionId, {
    rounds: [...rounds],
    currentRound: roundIdx + 1,
  })

  broadcast(discussionId, 'discussion:message-end', {
    participantId: participant.id,
    round: roundIdx,
    message,
  })

  return message
}

// 核心运行函数
export async function runDiscussion(discussionId: string): Promise<void> {
  const discussion = discussionStore.get(discussionId)
  if (!discussion) return

  const project = projectStore.get(discussion.projectId)
  if (!project) {
    broadcast(discussionId, 'discussion:error', { error: '项目不存在' })
    return
  }

  const participants = discussion.participantIds
    .map((id) => participantStore.get(id))
    .filter((p): p is Participant => !!p && p.enabled)

  if (participants.length < 2) {
    broadcast(discussionId, 'discussion:error', { error: '至少需要2个启用的AI参与' })
    return
  }

  // 读取上下文文件
  const fileContents = readFiles(project.path, discussion.context.filePaths)
  const baseCtx = {
    topic: discussion.topic,
    instruction: discussion.context.instruction,
    fileContents,
  }

  broadcast(discussionId, 'discussion:status', { status: 'discussing' })

  // 轮次规划:
  // round 0: 项目熟悉 (familiarize)
  // round 1: 认知对齐 (align)
  // round 2 ~ 2+maxRounds-1: 提案/互评 (propose/critique)
  // round 2+maxRounds: 共识 (consensus)
  const maxRounds = discussion.maxRounds
  const totalRounds = 2 + maxRounds // 不含共识轮
  let rounds = discussion.rounds.length > 0 ? [...discussion.rounds] : []

  // ============ 阶段一: 项目熟悉 (round 0) ============
  if (isStopped(discussionId)) return
  const famRound = 0
  if (!rounds[famRound]) {
    rounds[famRound] = { index: famRound, phase: 'familiarize', messages: [] }
  }

  broadcast(discussionId, 'discussion:round-start', {
    round: famRound,
    phase: 'familiarize',
    totalRounds,
  })

  for (const participant of participants) {
    if (isStopped(discussionId)) return
    const provider = providerStore.get(participant.providerId)
    if (!provider) continue

    const ctx = { ...baseCtx, participantName: participant.name }
    const prompt = familiarizePrompt(ctx)
    await aiSpeak(discussionId, provider, participant, famRound, 'familiarize', prompt.system, prompt.user, rounds)
  }
  broadcast(discussionId, 'discussion:round-end', { round: famRound })

  // ============ 阶段二: 认知对齐 (round 1) ============
  if (isStopped(discussionId)) return
  const alignRound = 1
  if (!rounds[alignRound]) {
    rounds[alignRound] = { index: alignRound, phase: 'align', messages: [] }
  }

  broadcast(discussionId, 'discussion:round-start', {
    round: alignRound,
    phase: 'align',
    totalRounds,
  })

  const famMessages = buildPreviousMessages({ ...discussion, rounds }, famRound)
  for (const participant of participants) {
    if (isStopped(discussionId)) return
    const provider = providerStore.get(participant.providerId)
    if (!provider) continue

    const ctx = { ...baseCtx, participantName: participant.name }
    const prompt = alignPrompt(ctx, famMessages)
    await aiSpeak(discussionId, provider, participant, alignRound, 'align', prompt.system, prompt.user, rounds)
  }
  broadcast(discussionId, 'discussion:round-end', { round: alignRound })

  // ============ 阶段三: 提案与互评 (round 2 ~ 2+maxRounds-1) ============
  // 提取每个AI在熟悉+对齐阶段形成的认知,用于后续提案
  const understandingMessages = buildPreviousMessages({ ...discussion, rounds }, alignRound)

  for (let discussIdx = 0; discussIdx < maxRounds; discussIdx++) {
    if (isStopped(discussionId)) return

    const roundIdx = 2 + discussIdx
    const phase = discussIdx === 0 ? 'propose' : discussIdx === maxRounds - 1 ? 'converge' : 'critique'

    if (!rounds[roundIdx]) {
      rounds[roundIdx] = { index: roundIdx, phase, messages: [] }
    }
    rounds[roundIdx].phase = phase

    broadcast(discussionId, 'discussion:round-start', {
      round: roundIdx,
      phase,
      totalRounds,
    })

    const previousMessages = buildPreviousMessages({ ...discussion, rounds }, roundIdx - 1)

    for (const participant of participants) {
      if (isStopped(discussionId)) return
      const provider = providerStore.get(participant.providerId)
      if (!provider) continue

      const ctx = { ...baseCtx, participantName: participant.name }
      const prompt =
        discussIdx === 0
          ? proposePrompt(ctx, understandingMessages)
          : critiquePrompt(ctx, discussIdx, previousMessages, understandingMessages)

      const msgType: MessageType = discussIdx === 0 ? 'idea' : 'refine'
      await aiSpeak(discussionId, provider, participant, roundIdx, msgType, prompt.system, prompt.user, rounds)
    }

    broadcast(discussionId, 'discussion:round-end', { round: roundIdx })
  }

  if (isStopped(discussionId)) return

  // ============ 阶段四: 共识生成 (round 2+maxRounds) ============
  broadcast(discussionId, 'discussion:status', { status: 'consensus' })

  const moderator = participants[0]
  const moderatorProvider = providerStore.get(moderator.providerId)
  if (!moderatorProvider) {
    broadcast(discussionId, 'discussion:error', { error: '主持人提供商不可用' })
    return
  }

  const consensusRound = 2 + maxRounds
  const allMessages = buildPreviousMessages({ ...discussion, rounds }, consensusRound - 1)
  const cPrompt = consensusPrompt({ ...baseCtx, participantName: moderator.name }, allMessages)

  if (!rounds[consensusRound]) {
    rounds[consensusRound] = { index: consensusRound, phase: 'converge', messages: [] }
  }

  broadcast(discussionId, 'discussion:message-start', {
    participantId: moderator.id,
    participantName: moderator.name + '(主持人)',
    round: consensusRound,
    type: 'summary',
  })

  let consensus = ''
  try {
    await streamChat(
      moderatorProvider,
      [{ role: 'user', content: cPrompt.user }],
      {
        model: moderator.model,
        temperature: 0.5,
        systemPrompt: cPrompt.system,
      },
      {
        onChunk: (chunk) => {
          consensus += chunk
          broadcast(discussionId, 'discussion:message-chunk', {
            participantId: moderator.id,
            round: consensusRound,
            chunk,
          })
        },
      },
    )
  } catch (err) {
    consensus = `共识生成失败: ${err instanceof Error ? err.message : String(err)}`
  }

  const consensusMsg = makeMessage(consensusRound, moderator, consensus, 'summary')
  rounds[consensusRound].messages.push(consensusMsg)

  discussionStore.update(discussionId, { rounds: [...rounds], consensus })
  broadcast(discussionId, 'discussion:message-end', {
    participantId: moderator.id,
    round: consensusRound,
    message: consensusMsg,
  })
  broadcast(discussionId, 'discussion:consensus', { consensus })

  if (isStopped(discussionId)) return

  // ============ 阶段五: 方案生成 ============
  broadcast(discussionId, 'discussion:status', { status: 'proposing' })

  const pPrompt = proposalPrompt({ ...baseCtx, participantName: moderator.name }, consensus)
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
    discussionStore.update(discussionId, { status: 'rejected' })
    return
  }

  // 解析方案
  const parsed = parseProposalJson(proposalText)

  // 生成 diff 和补充 originalContent
  const changes: FileChange[] = parsed.changes.map((c: any) => {
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

  // 保存方案
  const proposal = proposalStore.create({
    discussionId,
    summary: parsed.summary,
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
