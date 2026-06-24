import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Users, FileText, Target, Gauge, CircleStop, Send, Sparkles } from 'lucide-react'
import { useDiscussionStore } from '@/stores/discussion'
import { useParticipantStore } from '@/stores/participant'
import { useProjectStore } from '@/stores/project'
import { Button, Badge } from '@/components/ui'
import MessageBubble from '@/components/MessageBubble'
import ProposalCard from '@/components/ProposalCard'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import { cn } from '@/lib/utils'
import type { DiscussionStatus } from '../../shared/types'

const statusConfig: Record<DiscussionStatus, { label: string; color: 'amber' | 'blue' | 'indigo' | 'green' | 'red' }> = {
  discussing: { label: '讨论中', color: 'amber' },
  consensus: { label: '共识达成', color: 'blue' },
  proposing: { label: '生成方案', color: 'indigo' },
  reviewing: { label: '待审查', color: 'indigo' },
  executing: { label: '执行中', color: 'blue' },
  done: { label: '已完成', color: 'green' },
  rejected: { label: '已拒绝', color: 'red' },
}

const phaseLabels: Record<string, string> = {
  familiarize: '项目熟悉阶段',
  align: '认知对齐阶段',
  propose: '提案阶段',
  critique: '互评阶段',
  refine: '完善阶段',
  converge: '收敛阶段',
}

export default function DiscussionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const {
    current,
    liveMessages,
    streamingParticipantId,
    streamingText,
    currentRound,
    liveStatus,
    consensus,
    proposal,
    fetchDetail,
    subscribeLive,
    unsubscribeLive,
    stop,
    sendChatMessage,
    generateProposal,
  } = useDiscussionStore()
  const { participants } = useParticipantStore()
  const { projects } = useProjectStore()

  const scrollRef = useRef<HTMLDivElement>(null)
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (id) {
      fetchDetail(id)
      subscribeLive(id)
    }
    return () => unsubscribeLive()
  }, [id])

  // 自动滚动
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [liveMessages, streamingText])

  if (!current || !id) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-600 text-sm">
        加载中...
      </div>
    )
  }

  const status = liveStatus || current.status
  const statusInfo = statusConfig[status]
  const isChatMode = current.mode === 'chat'
  const discussionParticipants = current.participantIds
    .map((pid) => participants.find((p) => p.id === pid))
    .filter(Boolean)
  const project = projects.find((p) => p.id === current.projectId)

  const handleSendChat = async () => {
    if (!chatInput.trim() || sending || streamingParticipantId) return
    setSending(true)
    try {
      await sendChatMessage(id, chatInput.trim())
      setChatInput('')
    } finally {
      setSending(false)
    }
  }

  // 按轮次分组
  const groupedMessages: Record<number, typeof liveMessages> = {}
  for (const msg of liveMessages) {
    if (!groupedMessages[msg.round]) groupedMessages[msg.round] = []
    groupedMessages[msg.round].push(msg)
  }
  const rounds = Object.keys(groupedMessages).map(Number).sort((a, b) => a - b)

  return (
    <div className="flex h-full flex-col">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-6 py-3.5 border-b border-white/5 bg-ink-900/60">
        <button onClick={() => navigate('/discussions')} className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-base font-semibold text-white truncate">{current.topic}</h1>
          <p className="text-[10px] text-zinc-600">
            {project?.name || '未知项目'} · {discussionParticipants.length} 位AI · {isChatMode ? '自由对话' : `${current.maxRounds} 轮圆桌`}
          </p>
        </div>
        <Badge color={statusInfo.color}>{statusInfo.label}</Badge>
        {isChatMode && status === 'discussing' && liveMessages.length > 0 && !streamingParticipantId && (
          <Button variant="primary" size="sm" onClick={() => generateProposal(id)}>
            <Sparkles size={14} />
            生成方案
          </Button>
        )}
        {(status === 'discussing' || status === 'consensus' || status === 'proposing') && (
          <Button variant="ghost" size="sm" onClick={() => stop(id)}>
            <CircleStop size={14} />
            终止
          </Button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 左栏:参与方 */}
        <aside className="w-52 border-r border-white/5 bg-ink-900/30 p-4 overflow-y-auto">
          <div className="flex items-center gap-2 mb-3 text-xs font-medium text-zinc-500">
            <Users size={14} />
            参与方
          </div>
          <div className="space-y-2">
            {discussionParticipants.map((p) => {
              const isStreaming = streamingParticipantId === p!.id
              return (
                <div
                  key={p!.id}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-all',
                    isStreaming ? 'bg-accent/10 border border-accent/20' : 'border border-transparent',
                  )}
                >
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white shrink-0"
                    style={{ background: p!.color || '#6366f1' }}
                  >
                    {p!.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-zinc-200 truncate">{p!.name}</div>
                    <div className="text-[10px] text-zinc-600 truncate font-mono">{p!.model}</div>
                  </div>
                  {isStreaming && <div className="h-1.5 w-1.5 rounded-full bg-accent-light animate-pulse shrink-0" />}
                </div>
              )
            })}
          </div>

          {/* 轮次进度 */}
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-2 text-xs font-medium text-zinc-500">
              <Gauge size={14} />
              进度
            </div>
            <div className="space-y-1.5">
              {/* 项目熟悉 */}
              <div className="flex items-center gap-2">
                <div className={cn(
                  'h-1 flex-1 rounded-full',
                  0 < currentRound ? 'bg-cyan-500' : 0 === currentRound ? 'bg-cyan-500/40' : 'bg-white/5',
                )} />
                <span className="text-[10px] text-cyan-400/70 w-16">熟悉</span>
              </div>
              {/* 认知对齐 */}
              <div className="flex items-center gap-2">
                <div className={cn(
                  'h-1 flex-1 rounded-full',
                  1 < currentRound ? 'bg-teal-500' : 1 === currentRound ? 'bg-teal-500/40' : 'bg-white/5',
                )} />
                <span className="text-[10px] text-teal-400/70 w-16">对齐</span>
              </div>
              {/* 提案/互评 */}
              {Array.from({ length: current.maxRounds }, (_, i) => {
                const roundIdx = 2 + i
                return (
                  <div key={i} className="flex items-center gap-2">
                    <div className={cn(
                      'h-1 flex-1 rounded-full',
                      roundIdx < currentRound ? 'bg-accent' : roundIdx === currentRound ? 'bg-accent/40' : 'bg-white/5',
                    )} />
                    <span className="text-[10px] text-zinc-600 w-16">讨论{i + 1}</span>
                  </div>
                )
              })}
              {consensus && (
                <div className="flex items-center gap-2">
                  <div className="h-1 flex-1 rounded-full bg-blue-500" />
                  <span className="text-[10px] text-blue-400 w-16">共识</span>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* 中栏:讨论流 + 聊天输入 */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
          {rounds.map((round) => {
            const phase = current.rounds[round]?.phase
            const isModerator = round >= current.maxRounds
            return (
              <div key={round} className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/5" />
                  <span className="text-[10px] font-medium text-zinc-600 px-2">
                    {isModerator ? '共识生成' : `第 ${round + 1} 轮${phase ? ' · ' + (phaseLabels[phase] || phase) : ''}`}
                  </span>
                  <div className="h-px flex-1 bg-white/5" />
                </div>
                {groupedMessages[round].map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
              </div>
            )
          })}

          {/* 流式消息 */}
          {streamingParticipantId && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-accent/20" />
                <span className="text-[10px] font-medium text-accent-light px-2 animate-pulse-soft">生成中</span>
                <div className="h-px flex-1 bg-accent/20" />
              </div>
              <MessageBubble
                streaming
                streamingText={streamingText}
                message={{
                  id: 'streaming',
                  round: currentRound,
                  participantId: streamingParticipantId,
                  participantName: discussionParticipants.find((p) => p?.id === streamingParticipantId)?.name || 'AI',
                  role: 'assistant',
                  content: streamingText,
                  type: 'idea',
                  timestamp: Date.now(),
                }}
              />
            </div>
          )}

          {/* 共识 */}
          {consensus && (
            <div className="rounded-2xl glass p-5 border-blue-500/20">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15">
                  <Target size={16} className="text-blue-400" />
                </div>
                <h3 className="font-display text-sm font-semibold text-white">讨论共识</h3>
              </div>
              <MarkdownRenderer content={consensus} />
            </div>
          )}

          {/* 方案 */}
          {proposal && <ProposalCard proposal={proposal} discussionId={id} />}

          {/* 空状态 */}
          {liveMessages.length === 0 && !streamingParticipantId && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 mb-3">
                {isChatMode ? <Send size={24} className="text-accent-light" /> : <Target size={24} className="text-accent-light" />}
              </div>
              <p className="text-sm text-zinc-400">
                {isChatMode ? '发送消息开始对话,AI们会轮流回复' : '等待AI开始讨论...'}
              </p>
            </div>
          )}
          </div>

          {/* 聊天模式输入栏 */}
          {isChatMode && status !== 'rejected' && status !== 'done' && (
            <div className="flex items-center gap-2 px-6 py-3 border-t border-white/5 bg-ink-900/60">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendChat())}
                placeholder={streamingParticipantId ? 'AI正在回复中...' : '输入消息,与AI们对话讨论...'}
                disabled={sending || !!streamingParticipantId}
                className="flex-1 rounded-xl bg-ink-850 border border-white/5 px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/10 transition-all disabled:opacity-50"
              />
              <Button
                variant="primary"
                onClick={handleSendChat}
                disabled={!chatInput.trim() || sending || !!streamingParticipantId}
              >
                <Send size={15} />
                发送
              </Button>
            </div>
          )}
        </div>

        {/* 右栏:上下文 */}
        <aside className="w-64 border-l border-white/5 bg-ink-900/30 p-4 overflow-y-auto">
          <div className="flex items-center gap-2 mb-3 text-xs font-medium text-zinc-500">
            <FileText size={14} />
            任务说明
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed mb-4 rounded-xl bg-ink-850/60 p-3 border border-white/5">
            {current.context.instruction || '无具体说明'}
          </p>

          <div className="flex items-center gap-2 mb-2 text-xs font-medium text-zinc-500">
            <FileText size={14} />
            相关文件 ({current.context.filePaths.length})
          </div>
          <div className="space-y-1 mb-4">
            {current.context.filePaths.length === 0 ? (
              <p className="text-[11px] text-zinc-600">未指定文件</p>
            ) : (
              current.context.filePaths.map((fp) => (
                <div key={fp} className="text-[11px] font-mono text-zinc-500 truncate rounded-lg bg-ink-850/40 px-2 py-1">
                  {fp}
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
