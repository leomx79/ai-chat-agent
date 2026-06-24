// 消息处理器 - 接收 webview 消息,调度工具/LLM/讨论引擎
import * as vscode from 'vscode'
import { nanoid } from 'nanoid'
import { StateStore } from './store'
import { streamChatWithTools, streamChat, fetchModels } from './llm'
import { executeTool, isDangerousTool, toolDefinitions } from './tools'
import type { Provider, Participant, Discussion, DiscussionMessage, MessageType, FileChange } from '../../shared/types'
import { diffLines } from 'diff'
import * as path from 'path'

// 生成 diff 文本
function createDiff(original: string, modified: string, filePath = ''): string {
  const parts = diffLines(original, modified)
  let result = ''
  if (filePath) result += `--- a/${filePath}\n+++ b/${filePath}\n`
  for (const part of parts) {
    const prefix = part.added ? '+' : part.removed ? '-' : ' '
    const lines = part.value.split('\n')
    if (lines[lines.length - 1] === '') lines.pop()
    for (const line of lines) result += prefix + line + '\n'
  }
  return result
}

type PostFn = () => vscode.Webview | undefined

export class MessageHandler {
  private pendingApprovals = new Map<string, { resolve: (approved: boolean) => void }>()

  constructor(private store: StateStore, private post: PostFn) {}

  private send(msg: any) {
    this.post()?.postMessage(msg)
  }

  async handle(msg: any) {
    try {
      switch (msg.type) {
        case 'discussion:tool-approve':
          this.pendingApprovals.get(msg.confirmId)?.resolve(true)
          this.pendingApprovals.delete(msg.confirmId)
          break
        case 'discussion:tool-deny':
          this.pendingApprovals.get(msg.confirmId)?.resolve(false)
          this.pendingApprovals.delete(msg.confirmId)
          break
        case 'settings:auto-approve':
            this.store.setAutoApproveTools(msg.tools || [])
            break
        case 'ready':
          this.handleReady()
          break
        case 'provider:list':
          this.send({ type: 'provider:list', data: this.store.listProviders() })
          break
        case 'provider:save':
          await this.handleProviderSave(msg.data)
          break
        case 'provider:delete':
          this.store.deleteProvider(msg.id)
          this.send({ type: 'provider:list', data: this.store.listProviders() })
          break
        case 'provider:fetchModels':
          await this.handleFetchModels(msg.id)
          break
        case 'provider:test':
          await this.handleTestProvider(msg.id)
          break
        case 'participant:list':
          this.send({ type: 'participant:list', data: this.store.listParticipants() })
          break
        case 'participant:save':
          this.handleParticipantSave(msg.data)
          break
        case 'participant:delete':
          this.store.deleteParticipant(msg.id)
          this.send({ type: 'participant:list', data: this.store.listParticipants() })
          break
        case 'discussion:list':
          this.send({ type: 'discussion:list', data: this.store.listDiscussions() })
          break
        case 'discussion:create':
          await this.handleCreateDiscussion(msg.data)
          break
        case 'discussion:get':
          this.handleGetDiscussion(msg.id)
          break
        case 'discussion:chat':
          await this.handleChat(msg.id, msg.message)
          break
        case 'discussion:generateProposal':
          await this.handleGenerateProposal(msg.id)
          break
        case 'discussion:stop':
          this.handleStop(msg.id)
          break
        case 'discussion:approve':
          await this.handleApprove(msg.id)
          break
        case 'discussion:reject':
          this.handleReject(msg.id)
          break
        case 'workspace:info':
          this.handleWorkspaceInfo()
          break
      }
    } catch (err) {
      this.send({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  private handleReady() {
    this.send({ type: 'provider:list', data: this.store.listProviders() })
    this.send({ type: 'participant:list', data: this.store.listParticipants() })
    this.send({ type: 'discussion:list', data: this.store.listDiscussions() })
    this.handleWorkspaceInfo()
  }

  private handleWorkspaceInfo() {
    const ws = vscode.workspace.workspaceFolders?.[0]
    this.send({
      type: 'workspace:info',
      data: ws ? { name: ws.name, path: ws.uri.fsPath } : null,
    })
  }

  // ============ Provider ============
  private async handleProviderSave(data: any) {
    const provider = await this.store.saveProvider(data)
    this.send({ type: 'provider:list', data: this.store.listProviders() })
    this.send({ type: 'provider:saved', data: provider })
  }

  private async handleFetchModels(id: string) {
    this.send({ type: 'provider:fetch-start', data: { id } })
    const provider = await this.store.getProviderWithKey(id)
    if (!provider) {
      this.send({ type: 'error', message: '提供商不存在' })
      this.send({ type: 'provider:models', data: { id, models: [] } })
      return
    }
    try {
      const models = await fetchModels(provider)
      const updated = { ...provider, models: models.map((m) => ({ id: m.id, name: m.name, enabled: true })) }
      await this.store.saveProvider(updated)
      this.send({ type: 'provider:models', data: { id, models } })
    } catch (err) {
      this.send({ type: 'error', message: `拉取模型失败: ${err instanceof Error ? err.message : String(err)}` })
      this.send({ type: 'provider:models', data: { id, models: [] } })
    }
  }

  private async handleTestProvider(id: string) {
    const provider = await this.store.getProviderWithKey(id)
    if (!provider) {
      this.send({ type: 'provider:test', data: { id, success: false, message: '提供商不存在' } })
      return
    }
    try {
      const base = provider.baseUrl.replace(/\/+$/, '')
      const resp = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${provider.apiKey}` },
      })
      if (resp.ok) {
        const json: any = await resp.json()
        const count = json.data?.length || 0
        this.send({ type: 'provider:test', data: { id, success: true, message: `连接成功! 可用模型 ${count} 个` } })
      } else {
        const text = await resp.text().catch(() => '')
        this.send({ type: 'provider:test', data: { id, success: false, message: `HTTP ${resp.status}: ${text.slice(0, 100)}` } })
      }
    } catch (err) {
      this.send({ type: 'provider:test', data: { id, success: false, message: `连接失败: ${err instanceof Error ? err.message : String(err)}` } })
    }
  }

  // ============ Participant ============
  private handleParticipantSave(data: any) {
    const p = this.store.saveParticipant(data)
    this.send({ type: 'participant:list', data: this.store.listParticipants() })
    this.send({ type: 'participant:saved', data: p })
  }

  // ============ Discussion ============
  private async handleCreateDiscussion(data: any) {
    const id = nanoid(12)
    const now = Date.now()
    const discussion: Discussion = {
      id,
      projectId: data.projectId || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
      topic: data.topic,
      context: data.context || { filePaths: [], instruction: '' },
      participantIds: data.participantIds,
      rounds: [],
      status: 'discussing',
      mode: data.mode || 'roundtable',
      maxRounds: data.maxRounds || 3,
      currentRound: 0,
      createdAt: now,
      updatedAt: now,
    }
    this.store.saveDiscussion(discussion)
    this.send({ type: 'discussion:list', data: this.store.listDiscussions() })
    this.send({ type: 'discussion:created', data: discussion })

    // 圆桌模式: 自动启动
    if (discussion.mode === 'roundtable') {
      this.runRoundtable(id)
    }
  }

  private handleGetDiscussion(id: string) {
    const d = this.store.getDiscussion(id)
    const proposal = this.store.getProposalByDiscussion(id)
    this.send({ type: 'discussion:detail', data: { ...d, proposal } })
  }

  // ============ 圆桌模式 ============
  private stoppedSet = new Set<string>()

  private handleStop(id: string) {
    this.stoppedSet.add(id)
    const d = this.store.getDiscussion(id)
    if (d) {
      this.store.saveDiscussion({ ...d, status: 'rejected' })
      this.send({ type: 'discussion:status', data: { id, status: 'rejected' } })
    }
  }

  private isStopped(id: string): boolean {
    return this.stoppedSet.has(id)
  }

  private async runRoundtable(discussionId: string) {
    this.stoppedSet.delete(discussionId)
    const discussion = this.store.getDiscussion(discussionId)
    if (!discussion) return

    const participants = discussion.participantIds
      .map((id) => this.store.getParticipant(id))
      .filter((p): p is Participant => !!p && p.enabled)

    if (participants.length < 2) {
      this.send({ type: 'error', message: '至少需要2个启用的AI' })
      return
    }

    const baseCtx = {
      topic: discussion.topic,
      instruction: discussion.context.instruction,
    }

    this.send({ type: 'discussion:status', data: { id: discussionId, status: 'discussing' } })

    // 阶段一: 项目熟悉 - 所有AI同时用工具自主浏览项目 (并行)
    const round0 = 0
    this.send({ type: 'discussion:round-start', data: { id: discussionId, round: round0, phase: 'familiarize' } })

    const understandings: Record<string, string> = {}
    await Promise.all(participants.map(async (p) => {
      if (this.isStopped(discussionId)) return
      const provider = await this.store.getProviderWithKey(p.providerId)
      if (!provider) return

      this.send({ type: 'discussion:message-start', data: { id: discussionId, participantId: p.id, participantName: p.name, round: round0, type: 'familiarize' } })

      const system = `${p.systemPrompt}

你是「${p.name}」,正在参与多AI圆桌讨论。请先使用工具(list_files, read_file)自主浏览项目,理解项目结构和代码,然后分享你的认知。

规则:
1. 使用 list_files 和 read_file 工具浏览项目文件。
2. 从你的角色角度梳理项目理解。
3. 所有描述必须基于真实代码,禁止臆测。
4. 明确标注不确定的地方。
5. 不要提出修改方案,只做项目理解。`

      const user = `## 讨论主题\n${discussion.topic}\n\n## 任务要求\n${discussion.context.instruction || '根据主题修改项目'}\n\n请先用工具浏览项目文件,然后分享你对项目的理解。`

      try {
        const result = await this.runAgentLoop(discussionId, provider, p, round0, 'familiarize', system, user)
        understandings[p.id] = result
        this.saveAndBroadcastMessage(discussionId, round0, p, result, 'familiarize')
      } catch (err) {
        const errMsg = `熟悉项目失败: ${err instanceof Error ? err.message : String(err)}`
        understandings[p.id] = errMsg
        this.saveAndBroadcastMessage(discussionId, round0, p, errMsg, 'familiarize')
      }
    }))
    this.send({ type: 'discussion:round-end', data: { id: discussionId, round: round0 } })

    // 阶段二: 认知对齐
    if (this.isStopped(discussionId)) return
    const round1 = 1
    this.send({ type: 'discussion:round-start', data: { id: discussionId, round: round1, phase: 'align' } })

    const allUnderstanding = participants.map((p) => `[${p.name}]: ${understandings[p.id] || ''}`).join('\n\n')

    await Promise.all(participants.map(async (p) => {
      if (this.isStopped(discussionId)) return
      const provider = await this.store.getProviderWithKey(p.providerId)
      if (!provider) return

      this.send({ type: 'discussion:message-start', data: { id: discussionId, participantId: p.id, participantName: p.name, round: round1, type: 'align' } })

      const system = `${p.systemPrompt}\n\n你是「${p.name}」,认知对齐阶段。对比其他AI的理解,找出差异,补充遗漏,纠正错误(引用代码)。不要提方案。`
      const user = `## 讨论主题\n${discussion.topic}\n\n## 各AI的项目理解\n${allUnderstanding}\n\n请进行认知对齐,分享你的完整认知。`

      try {
        const result = await this.runAgentLoop(discussionId, provider, p, round1, 'align', system, user)
        this.saveAndBroadcastMessage(discussionId, round1, p, result, 'align')
      } catch (err) {
        const errMsg = `认知对齐失败: ${err instanceof Error ? err.message : String(err)}`
        this.saveAndBroadcastMessage(discussionId, round1, p, errMsg, 'align')
      }
    }))
    this.send({ type: 'discussion:round-end', data: { id: discussionId, round: round1 } })

    // 阶段三: 主线推进 - 轮流担任主推手,其他AI质疑,主推手修正
    const understandingText = participants.map((p) => `[${p.name}]: ${understandings[p.id] || ''}`).join('\n\n')
    const maxRounds = discussion.maxRounds
    const allDiscussionText = understandingText // 累积所有讨论内容,供后续主推手参考

    for (let i = 0; i < maxRounds; i++) {
      if (this.isStopped(discussionId)) return
      const roundIdx = 2 + i * 3 // 每轮占3个round: lead + critique + revise
      const leadIdx = i % participants.length
      const lead = participants[leadIdx]
      const reviewers = participants.filter((_, idx) => idx !== leadIdx)

      // === 步骤1: 主推手提出方案 (含思考过程) ===
      this.send({ type: 'discussion:round-start', data: { id: discussionId, round: roundIdx, phase: 'lead' } })
      {
        if (this.isStopped(discussionId)) break
        const provider = await this.store.getProviderWithKey(lead.providerId)
        if (provider) {
          this.send({ type: 'discussion:message-start', data: { id: discussionId, participantId: lead.id, participantName: lead.name, round: roundIdx, type: 'lead' } })
          const prevDiscussion = this.buildPrevMessages(discussionId, roundIdx - 1)
          const system = `${lead.systemPrompt}

你是「${lead.name}」,本轮的主推手。请从你的专业角度推进讨论主线。

要求:
1. 详细展示你的思考过程: 为什么这样设计? 考虑了哪些方案? 为什么选这个?
2. 明确你的推进方向和核心决策
3. 给出具体的方案/架构/代码设计
4. 可使用工具查看代码细节,确保方案基于真实代码
5. 主动提出你不确定的地方,邀请其他角色质疑`
          const user = `## 讨论主题\n${discussion.topic}\n\n## 项目认知\n${allDiscussionText}\n\n## 前序讨论\n${prevDiscussion}\n\n请作为本轮主推手,详细展示你的思考过程和方案推进。`

          try {
            const result = await this.runAgentLoop(discussionId, provider, lead, roundIdx, 'lead', system, user)
            this.saveAndBroadcastMessage(discussionId, roundIdx, lead, result, 'lead')
          } catch (err) {
            const errMsg = `主推失败: ${err instanceof Error ? err.message : String(err)}`
            this.saveAndBroadcastMessage(discussionId, roundIdx, lead, errMsg, 'lead')
          }
        }
      }
      this.send({ type: 'discussion:round-end', data: { id: discussionId, round: roundIdx } })

      // === 步骤2: 其他AI质疑 (并行) ===
      const critiqueRound = roundIdx + 1
      this.send({ type: 'discussion:round-start', data: { id: discussionId, round: critiqueRound, phase: 'critique' } })
      const leadProposal = this.buildPrevMessages(discussionId, roundIdx)

      await Promise.all(reviewers.map(async (p) => {
        if (this.isStopped(discussionId)) return
        const provider = await this.store.getProviderWithKey(p.providerId)
        if (!provider) return

        this.send({ type: 'discussion:message-start', data: { id: discussionId, participantId: p.id, participantName: p.name, round: critiqueRound, type: 'critique' } })
        const system = `${p.systemPrompt}

你是「${p.name}」,正在审阅主推手「${lead.name}」的方案。

要求:
1. 深度理解主推手的思考方式、方向和过程
2. 从你的专业角度提出质疑: 有什么问题? 什么可以改进?
3. 指出潜在的幻觉、矛盾、过度设计或遗漏
4. 提出具体的改进建议,而非泛泛而谈
5. 可使用工具验证主推手的说法是否准确
6. 如果方案合理,也要明确表示认可并说明原因`
        const user = `## 讨论主题\n${discussion.topic}\n\n## 主推手「${lead.name}」的方案\n${leadProposal}\n\n请审阅并提出你的质疑和改进建议。`

        try {
          const result = await this.runAgentLoop(discussionId, provider, p, critiqueRound, 'critique', system, user)
          this.saveAndBroadcastMessage(discussionId, critiqueRound, p, result, 'critique')
        } catch (err) {
          const errMsg = `质疑失败: ${err instanceof Error ? err.message : String(err)}`
          this.saveAndBroadcastMessage(discussionId, critiqueRound, p, errMsg, 'critique')
        }
      }))
      this.send({ type: 'discussion:round-end', data: { id: discussionId, round: critiqueRound } })

      // === 步骤3: 主推手修正方案 ===
      const reviseRound = roundIdx + 2
      this.send({ type: 'discussion:round-start', data: { id: discussionId, round: reviseRound, phase: 'revise' } })
      {
        if (this.isStopped(discussionId)) break
        const provider = await this.store.getProviderWithKey(lead.providerId)
        if (provider) {
          this.send({ type: 'discussion:message-start', data: { id: discussionId, participantId: lead.id, participantName: lead.name, round: reviseRound, type: 'revise' } })
          const critiques = this.buildPrevMessages(discussionId, critiqueRound)
          const system = `${lead.systemPrompt}

你是「${lead.name}」,本轮主推手。其他角色已对你的方案提出质疑。

要求:
1. 逐条回应每个质疑: 接受、拒绝还是部分采纳? 为什么?
2. 基于有效质疑修正你的方案
3. 明确哪些地方做了调整,为什么
4. 如果某些质疑你不认同,给出理由
5. 输出修正后的完整方案`
          const user = `## 讨论主题\n${discussion.topic}\n\n## 你的原始方案\n${leadProposal}\n\n## 其他角色的质疑\n${critiques}\n\n请回应质疑并修正方案。`

          try {
            const result = await this.runAgentLoop(discussionId, provider, lead, reviseRound, 'revise', system, user)
            this.saveAndBroadcastMessage(discussionId, reviseRound, lead, result, 'revise')
          } catch (err) {
            const errMsg = `修正失败: ${err instanceof Error ? err.message : String(err)}`
            this.saveAndBroadcastMessage(discussionId, reviseRound, lead, errMsg, 'revise')
          }
        }
      }
      this.send({ type: 'discussion:round-end', data: { id: discussionId, round: reviseRound } })
    }

    if (this.isStopped(discussionId)) return

    // 阶段四: 共识 + 方案
    this.send({ type: 'discussion:status', data: { id: discussionId, status: 'consensus' } })
    const moderator = participants[0]
    const modProvider = await this.store.getProviderWithKey(moderator.providerId)
    if (!modProvider) return

    const allMsgs = this.buildPrevMessages(discussionId, 1 + maxRounds * 3)
    const consensusRound = 2 + maxRounds * 3
    this.send({ type: 'discussion:message-start', data: { id: discussionId, participantId: moderator.id, participantName: moderator.name + '(主持人)', round: consensusRound, type: 'summary' } })

    let consensus = ''
    try {
      consensus = await streamChat(modProvider, [{ role: 'user', content: `## 讨论主题\n${discussion.topic}\n\n## 完整讨论记录\n${allMsgs}\n\n请生成共识摘要:1.一致同意的修改点 2.分歧及推荐 3.最终方向` }], { model: moderator.model, temperature: 0.5, systemPrompt: '你是讨论主持人,汇总各方观点生成共识。基于代码,不要引入新内容。' }, {
        onChunk: (c) => { consensus += c; this.send({ type: 'discussion:chunk', data: { id: discussionId, participantId: moderator.id, round: consensusRound, chunk: c } }) },
      })
    } catch (err) {
      consensus = `共识失败: ${err instanceof Error ? err.message : String(err)}`
    }
    this.saveAndBroadcastMessage(discussionId, consensusRound, moderator, consensus, 'summary')
    this.send({ type: 'discussion:consensus', data: { id: discussionId, consensus } })

    // 方案生成
    this.send({ type: 'discussion:status', data: { id: discussionId, status: 'proposing' } })
    let proposalText = ''
    try {
      proposalText = await streamChat(modProvider, [{ role: 'user', content: `## 讨论主题\n${discussion.topic}\n\n## 共识\n${consensus}\n\n请生成修改方案,输出JSON:\n\`\`\`json\n{"summary":"说明","changes":[{"filePath":"路径","action":"create|modify|delete","content":"完整内容","reason":"理由"}]}\n\`\`\`` }], { model: moderator.model, temperature: 0.3, systemPrompt: '你是方案生成器,将共识转为JSON格式修改方案。只输出JSON。' }, {})
    } catch (err) {
      this.send({ type: 'error', message: `方案生成失败: ${err instanceof Error ? err.message : String(err)}` })
      return
    }

    // 解析方案
    const parsed = this.parseProposalJson(proposalText)
    const changes: FileChange[] = await Promise.all(parsed.changes.map(async (c: any) => {
      const change: FileChange = { id: nanoid(10), filePath: c.filePath || '', action: c.action || 'modify', content: c.content || '', reason: c.reason || '' }
      if (change.action === 'modify' && change.filePath) {
        try {
          const root = vscode.workspace.workspaceFolders?.[0]
          if (root) {
            const uri = vscode.Uri.joinPath(root.uri, change.filePath)
            const bytes = await vscode.workspace.fs.readFile(uri)
            change.originalContent = Buffer.from(bytes).toString('utf8')
            change.diff = createDiff(change.originalContent, change.content, change.filePath)
          }
        } catch { change.action = 'create' }
      }
      return change
    }))

    const proposal = { id: nanoid(12), discussionId, summary: parsed.summary, changes, status: 'pending' as const, createdAt: Date.now() }
    this.store.saveProposal(proposal)
    this.store.saveDiscussion({ id: discussionId, proposalId: proposal.id, status: 'reviewing' })
    this.send({ type: 'discussion:proposal', data: { id: discussionId, proposal } })
    this.send({ type: 'discussion:status', data: { id: discussionId, status: 'reviewing' } })
  }

  // Agent 循环: LLM 回复 + 工具调用 + 再回复,直到无工具调用
  private async runAgentLoop(
    discussionId: string,
    provider: Provider,
    participant: Participant,
    round: number,
    msgType: MessageType,
    system: string,
    userContent: string,
  ): Promise<string> {
    const messages: any[] = [{ role: 'user', content: userContent }]
    let finalText = ''

    for (let loop = 0; loop < 5; loop++) { // 最多5轮工具调用
      if (this.isStopped(discussionId)) return finalText

      let text = ''
      let result: { text: string; toolCalls: { name: string; arguments: any }[]; reasoningContent?: string }
      try {
        result = await streamChatWithTools(
          provider,
          messages, // 直接传递完整消息数组
          { model: participant.model, temperature: participant.temperature, systemPrompt: system },
          {
            onChunk: (c) => {
              text += c
              this.send({ type: 'discussion:chunk', data: { id: discussionId, participantId: participant.id, participantName: participant.name, round, chunk: c } })
          },
          onToolCall: (name, args) => {
            this.send({ type: 'discussion:tool-call', data: { id: discussionId, participantId: participant.id, participantName: participant.name, name, args, round } })
          },
        },
      )
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        this.send({ type: 'error', message: `[${participant.name}] API错误: ${errMsg}` })
        this.send({ type: 'discussion:message-end', data: { id: discussionId, participantId: participant.id, round, message: { id: nanoid(12), round, participantId: participant.id, participantName: participant.name, role: 'assistant', content: finalText || '(请求失败)', type: msgType, timestamp: Date.now() } } })
        return finalText
      }

      finalText = text || finalText

      // 如果没有工具调用,结束循环
      if (result.toolCalls.length === 0) {
        return text || finalText
      }

      // 为每个工具调用生成唯一 ID,加入 assistant 消息
      const toolCallIds: string[] = []
      const assistantToolCalls = result.toolCalls.map((tc, i) => {
        const id = `call_${loop}_${i}_${Date.now()}`
        toolCallIds.push(id)
        return { id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.arguments) } }
      })
      messages.push({ role: 'assistant', content: text || '(empty)', reasoning_content: result.reasoningContent || undefined, tool_calls: assistantToolCalls })

      // 执行工具调用并加入 tool 结果消息
      for (let i = 0; i < result.toolCalls.length; i++) {
        const tc = result.toolCalls[i]
        const callId = toolCallIds[i]

        // 危险工具需确认 - 内联审批 (支持 auto-approve)
        const autoApproveTools = this.store.getAutoApproveTools()
        if (isDangerousTool(tc.name) && !autoApproveTools.includes(tc.name)) {
          const confirmId = `confirm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          this.send({ type: 'discussion:tool-confirm', data: { id: discussionId, confirmId, participantId: participant.id, participantName: participant.name, name: tc.name, args: tc.arguments, round } })
          const approved = await new Promise<boolean>((resolve) => {
            this.pendingApprovals.set(confirmId, { resolve })
            // 60秒超时自动拒绝
            setTimeout(() => {
              if (this.pendingApprovals.has(confirmId)) {
                this.pendingApprovals.delete(confirmId)
                resolve(false)
              }
            }, 60000)
          })
          if (!approved) {
            this.send({ type: 'discussion:tool-result', data: { id: discussionId, participantId: participant.id, participantName: participant.name, name: tc.name, result: '✗ 用户拒绝执行', round } })
            messages.push({ role: 'tool', content: `用户拒绝了 ${tc.name} 操作`, tool_call_id: callId })
            continue
          }
        }

        const toolResult = await executeTool(tc.name, tc.arguments)
        this.send({ type: 'discussion:tool-result', data: { id: discussionId, participantId: participant.id, participantName: participant.name, name: tc.name, result: toolResult.slice(0, 5000), round } })
        messages.push({ role: 'tool', content: toolResult, tool_call_id: callId })
      }
      // 继续循环,让 LLM 基于工具结果回复
    }

    return finalText
  }

  private saveAndBroadcastMessage(discussionId: string, round: number, participant: Participant, content: string, type: MessageType) {
    const msg: DiscussionMessage = {
      id: nanoid(12),
      round,
      participantId: participant.id,
      participantName: participant.name,
      role: 'assistant',
      content,
      type,
      timestamp: Date.now(),
    }
    const d = this.store.getDiscussion(discussionId)
    if (d) {
      if (!d.rounds[round]) d.rounds[round] = { index: round, phase: type === 'familiarize' ? 'familiarize' : type === 'align' ? 'align' : type === 'lead' ? 'lead' : type === 'critique' ? 'critique' : type === 'revise' ? 'revise' : 'converge', messages: [] }
      d.rounds[round].messages.push(msg)
      d.currentRound = round + 1
      this.store.saveDiscussion(d)
    }
    this.send({ type: 'discussion:message-end', data: { id: discussionId, participantId: participant.id, round, message: msg } })
  }

  private buildPrevMessages(discussionId: string, upToRound: number): string {
    const d = this.store.getDiscussion(discussionId)
    if (!d) return ''
    let text = ''
    for (let r = 0; r <= upToRound && r < d.rounds.length; r++) {
      for (const msg of d.rounds[r].messages) {
        text += `\n**[${msg.participantName}]**: ${msg.content}\n`
      }
    }
    return text
  }

  private parseProposalJson(text: string): { summary: string; changes: any[] } {
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    const s = m ? m[1].trim() : text.trim()
    try {
      const p = JSON.parse(s)
      return { summary: p.summary || '', changes: Array.isArray(p.changes) ? p.changes : [] }
    } catch {
      const st = s.indexOf('{'), en = s.lastIndexOf('}')
      if (st !== -1 && en !== -1) {
        try { const p = JSON.parse(s.slice(st, en + 1)); return { summary: p.summary || '', changes: Array.isArray(p.changes) ? p.changes : [] } } catch {}
      }
      return { summary: '解析失败', changes: [] }
    }
  }

  // ============ 聊天模式 ============
  private async handleChat(discussionId: string, userMessage: string) {
    const discussion = this.store.getDiscussion(discussionId)
    if (!discussion || discussion.mode !== 'chat') return

    const participants = discussion.participantIds
      .map((id) => this.store.getParticipant(id))
      .filter((p): p is Participant => !!p && p.enabled)

    const chatRound = discussion.rounds.length
    if (!discussion.rounds[chatRound]) {
      discussion.rounds[chatRound] = { index: chatRound, phase: 'lead', messages: [] }
    }

    // 保存用户消息
    const userMsg: DiscussionMessage = { id: nanoid(12), round: chatRound, participantId: 'user', participantName: '用户', role: 'user', content: userMessage, type: 'user', timestamp: Date.now() }
    discussion.rounds[chatRound].messages.push(userMsg)
    this.store.saveDiscussion(discussion)
    this.send({ type: 'discussion:message-end', data: { id: discussionId, participantId: 'user', round: chatRound, message: userMsg } })

    // 构建聊天历史
    const chatHistory = this.buildPrevMessages(discussionId, chatRound)

    // 所有AI同时回复 (并行)
    await Promise.all(participants.map(async (p) => {
      if (this.isStopped(discussionId)) return
      const provider = await this.store.getProviderWithKey(p.providerId)
      if (!provider) return

      this.send({ type: 'discussion:message-start', data: { id: discussionId, participantId: p.id, participantName: p.name, round: chatRound, type: 'idea' } })

      const system = `${p.systemPrompt}\n\n你是「${p.name}」,在自由对话中。基于项目代码和对话历史回复。可使用工具查看代码。从你的角色角度给出专业见解。`
      const user = `## 对话历史\n${chatHistory}\n\n请回复:`

      try {
        const result = await this.runAgentLoop(discussionId, provider, p, chatRound, 'lead', system, user)
        this.saveAndBroadcastMessage(discussionId, chatRound, p, result, 'lead')
      } catch (err) {
        const errMsg = `回复失败: ${err instanceof Error ? err.message : String(err)}`
        this.saveAndBroadcastMessage(discussionId, chatRound, p, errMsg, 'lead')
      }
    }))
    this.send({ type: 'discussion:round-end', data: { id: discussionId, round: chatRound } })
  }

  // ============ 聊天模式: 手动生成方案 ============
  private async handleGenerateProposal(discussionId: string) {
    const discussion = this.store.getDiscussion(discussionId)
    if (!discussion) return

    const participants = discussion.participantIds
      .map((id) => this.store.getParticipant(id))
      .filter((p): p is Participant => !!p && p.enabled)
    const moderator = participants[0]
    const provider = await this.store.getProviderWithKey(moderator.providerId)
    if (!provider) return

    this.send({ type: 'discussion:status', data: { id: discussionId, status: 'proposing' } })

    const chatHistory = this.buildPrevMessages(discussionId, discussion.rounds.length - 1)
    let proposalText = ''
    try {
      proposalText = await streamChat(provider, [{ role: 'user', content: `## 讨论主题\n${discussion.topic}\n\n## 对话记录\n${chatHistory}\n\n请基于对话生成修改方案,输出JSON。` }], { model: moderator.model, temperature: 0.3, systemPrompt: '你是方案生成器,将对话共识转为JSON修改方案。只输出JSON。' }, {})
    } catch (err) {
      this.send({ type: 'error', message: `方案生成失败: ${err instanceof Error ? err.message : String(err)}` })
      return
    }

    const parsed = this.parseProposalJson(proposalText)
    const changes: FileChange[] = await Promise.all(parsed.changes.map(async (c: any) => {
      const change: FileChange = { id: nanoid(10), filePath: c.filePath || '', action: c.action || 'modify', content: c.content || '', reason: c.reason || '' }
      if (change.action === 'modify' && change.filePath) {
        try {
          const root = vscode.workspace.workspaceFolders?.[0]
          if (root) {
            const uri = vscode.Uri.joinPath(root.uri, change.filePath)
            const bytes = await vscode.workspace.fs.readFile(uri)
            change.originalContent = Buffer.from(bytes).toString('utf8')
            change.diff = createDiff(change.originalContent, change.content, change.filePath)
          }
        } catch { change.action = 'create' }
      }
      return change
    }))

    const proposal = { id: nanoid(12), discussionId, summary: parsed.summary, changes, status: 'pending' as const, createdAt: Date.now() }
    this.store.saveProposal(proposal)
    this.store.saveDiscussion({ id: discussionId, proposalId: proposal.id, status: 'reviewing' })
    this.send({ type: 'discussion:proposal', data: { id: discussionId, proposal } })
    this.send({ type: 'discussion:status', data: { id: discussionId, status: 'reviewing' } })
  }

  // ============ 方案批准/拒绝 ============
  private async handleApprove(discussionId: string) {
    const discussion = this.store.getDiscussion(discussionId)
    const proposal = this.store.getProposalByDiscussion(discussionId)
    if (!discussion || !proposal) return

    this.store.saveDiscussion({ id: discussionId, status: 'executing' })
    this.send({ type: 'discussion:status', data: { id: discussionId, status: 'executing' } })

    const root = vscode.workspace.workspaceFolders?.[0]
    const results: string[] = []

    if (root) {
      for (const change of proposal.changes) {
        try {
          const uri = vscode.Uri.joinPath(root.uri, change.filePath)
          if (change.action === 'delete') {
            await vscode.workspace.fs.delete(uri)
            results.push(`✓ 删除: ${change.filePath}`)
          } else {
            const content = Buffer.from(change.content, 'utf8')
            await vscode.workspace.fs.writeFile(uri, content)
            results.push(`✓ ${change.action === 'create' ? '创建' : '修改'}: ${change.filePath}`)
          }
        } catch (err) {
          results.push(`✗ 失败: ${change.filePath} - ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }

    this.store.saveProposal({ ...proposal, status: 'executed' })
    this.store.saveDiscussion({ id: discussionId, status: 'done' })
    this.send({ type: 'discussion:status', data: { id: discussionId, status: 'done' } })
    this.send({ type: 'discussion:approve-result', data: { id: discussionId, results } })
  }

  private handleReject(discussionId: string) {
    const discussion = this.store.getDiscussion(discussionId)
    const proposal = this.store.getProposalByDiscussion(discussionId)
    if (proposal) this.store.saveProposal({ ...proposal, status: 'rejected' })
    if (discussion) this.store.saveDiscussion({ id: discussionId, status: 'rejected' })
    this.send({ type: 'discussion:status', data: { id: discussionId, status: 'rejected' } })
  }
}
