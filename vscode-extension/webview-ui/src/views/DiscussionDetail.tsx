// 讨论详情视图 - Copilot Chat 风格
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowLeft, Send, Sparkles, Square, Check, X, FileCode, Wrench, FolderTree, Search, Terminal, Loader, ChevronDown, ChevronRight, AlertTriangle, ArrowDown, Copy, ShieldAlert } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useStore, type StreamItem } from '../store'

const toolIcons: Record<string, any> = {
  list_files: FolderTree,
  read_file: FileCode,
  search_files: Search,
  write_file: Wrench,
  execute_command: Terminal,
}

const toolColors: Record<string, string> = {
  list_files: '#60a5fa',
  read_file: '#34d399',
  search_files: '#fbbf24',
  write_file: '#f87171',
  execute_command: '#a78bfa',
}

const toolLabels: Record<string, string> = {
  list_files: '浏览目录',
  read_file: '读取文件',
  search_files: '搜索',
  write_file: '写入文件',
  execute_command: '执行命令',
}

const typeLabels: Record<string, { text: string; color: string }> = {
  familiarize: { text: '项目理解', color: '#22d3ee' },
  align: { text: '认知对齐', color: '#2dd4bf' },
  lead: { text: '主线推进', color: '#f59e0b' },
  critique: { text: '质疑', color: '#f87171' },
  revise: { text: '修正', color: '#60a5fa' },
  summary: { text: '总结', color: '#a78bfa' },
  user: { text: '用户', color: '#34d399' },
  system: { text: '系统', color: '#9ca3af' },
}

export function DiscussionDetail() {
  const {
    currentDiscussion, streamItems, streamingParticipantIds, liveStatus,
    participants, setView, sendChat, generateProposal, stopDiscussion, approveProposal, rejectProposal,
    error, isAtBottom, setAtBottom, pendingConfirm, approveTool, denyTool,
  } = useStore()

  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [chatInput, setChatInput] = useState('')
  const [showScrollBtn, setShowScrollBtn] = useState(false)

  const d = currentDiscussion
  const isChatMode = d?.mode === 'chat'
  const status = liveStatus || d?.status || 'discussing'
  const isStreaming = streamingParticipantIds.length > 0
  const isActive = status === 'discussing' || status === 'consensus' || status === 'proposing'
  const proposal = d?.proposal

  // 智能滚动
  const checkScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    setAtBottom(atBottom)
    setShowScrollBtn(!atBottom && streamItems.length > 3)
  }, [streamItems.length, setAtBottom])

  useEffect(() => {
    if (isAtBottom) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [streamItems])

  // textarea 自动高度
  useEffect(() => {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
    }
  }, [chatInput])

  if (!d) {
    return <div className="empty"><p>加载中...</p></div>
  }

  const discussionParticipants = d.participantIds
    .map((pid) => participants.find((p) => p.id === pid))
    .filter(Boolean)

  const handleSend = () => {
    if (!chatInput.trim() || isStreaming) return
    sendChat(d.id, chatInput.trim())
    setChatInput('')
  }

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    setAtBottom(true)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
      {/* 头部 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <button className="btn-icon" onClick={() => setView('discussions')}>
          <ArrowLeft size={15} />
        </button>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.topic}</div>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
            {discussionParticipants.length} AI · {isChatMode ? '自由对话' : `${d.maxRounds}轮圆桌`}
          </div>
        </div>
        {isChatMode && status === 'discussing' && streamItems.length > 0 && !isStreaming && (
          <button className="btn" onClick={() => generateProposal(d.id)} style={{ padding: '4px 10px' }}>
            <Sparkles size={13} /> 生成方案
          </button>
        )}
      </div>

      {/* 消息流 */}
      <div ref={scrollRef} onScroll={checkScroll} style={{ flex: 1, overflow: 'auto', padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {streamItems.length === 0 && !isStreaming && (
          <div className="empty">
            {isChatMode ? <Send size={28} /> : <Sparkles size={28} />}
            <p style={{ marginTop: 10, fontSize: 13 }}>
              {isChatMode ? '发送消息开始对话' : 'AI 正在自主浏览项目...'}
            </p>
            <p style={{ fontSize: 11, marginTop: 4 }}>
              {isChatMode ? 'AI 会用工具浏览项目文件后回复' : '多个 AI 将自主讨论'}
            </p>
          </div>
        )}
        {streamItems.map((item) => (
          <StreamItemView key={item.id} item={item} participants={discussionParticipants} isStreaming={isStreaming} streamingIds={streamingParticipantIds} error={error} />
        ))}
      </div>

      {/* 回到底部 */}
      {showScrollBtn && (
        <div style={{ position: 'absolute', bottom: 80, right: 16, zIndex: 10 }}>
          <button className="btn-icon" onClick={scrollToBottom} style={{ background: 'var(--input-bg)', boxShadow: '0 2px 8px rgba(0,0,0,0.3)', border: '1px solid var(--border)' }}>
            <ArrowDown size={15} />
          </button>
        </div>
      )}

      {/* 方案审查 */}
      {proposal && (status === 'reviewing' || status === 'executing' || status === 'done' || status === 'rejected') && (
        <ProposalReview proposal={proposal} onApprove={() => approveProposal(d.id)} onReject={() => rejectProposal(d.id)} status={status} />
      )}

      {/* 内联工具审批 */}
      {pendingConfirm && (
        <div style={{
          padding: '8px 12px', borderTop: '1px solid var(--border)', flexShrink: 0,
          background: 'rgba(210, 153, 34, 0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <ShieldAlert size={14} style={{ color: 'var(--warning)' }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              {pendingConfirm.participantName} 请求执行 {toolLabels[pendingConfirm.name] || pendingConfirm.name}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 6, fontFamily: 'Consolas, monospace' }}>
            {pendingConfirm.name === 'write_file' ? pendingConfirm.args.path : pendingConfirm.args.command}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn" onClick={() => approveTool(pendingConfirm.confirmId)} style={{ background: 'var(--success)', padding: '3px 12px' }}>
              <Check size={13} /> 允许
            </button>
            <button className="btn-ghost btn" onClick={() => denyTool(pendingConfirm.confirmId)} style={{ padding: '3px 12px' }}>
              <X size={13} /> 拒绝
            </button>
          </div>
        </div>
      )}

      {/* 输入区 (chat 模式) */}
      {isChatMode && status !== 'rejected' && status !== 'done' && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <div className="chat-input-wrap">
            <textarea
              ref={textareaRef}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder={isStreaming ? 'AI 正在回复...' : '输入消息,Enter 发送,Shift+Enter 换行'}
              disabled={isStreaming}
              rows={1}
              style={{
                width: '100%', border: 'none', background: 'transparent',
                color: 'var(--input-fg)', fontSize: 13, fontFamily: 'inherit',
                padding: '8px 12px', resize: 'none', minHeight: 36, maxHeight: 120,
                overflow: 'auto', outline: 'none',
              }}
            />
            <div className="chat-input-toolbar">
              <span style={{ fontSize: 10, color: 'var(--fg-muted)', flex: 1 }}>
                {isStreaming ? '生成中...' : '就绪'}
              </span>
              {isStreaming ? (
                <button className="btn-icon" onClick={() => stopDiscussion(d.id)} style={{ color: 'var(--error)' }}>
                  <Square size={14} fill="currentColor" />
                </button>
              ) : (
                <button className="btn-icon" onClick={handleSend} disabled={!chatInput.trim()} style={{ color: chatInput.trim() ? 'var(--accent)' : 'var(--fg-muted)' }}>
                  <Send size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 圆桌模式停止按钮 */}
      {!isChatMode && isActive && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button className="btn-ghost btn" onClick={() => stopDiscussion(d.id)} style={{ width: '100%', justifyContent: 'center', padding: '6px' }}>
            <Square size={13} /> 停止讨论
          </button>
        </div>
      )}
    </div>
  )
}

// ============ 消息流条目 ============
function StreamItemView({ item, participants, isStreaming, streamingIds, error }: { item: StreamItem; participants: any[]; isStreaming: boolean; streamingIds: string[]; error: string | null }) {
  if (item.kind === 'tool') return <ToolCard item={item} />
  if (item.kind === 'error') return <ErrorCard error={error} />
  return <MessageCard item={item} participants={participants} isStreaming={isStreaming} streamingIds={streamingIds} />
}

// ============ 文本消息 ============
function MessageCard({ item, participants, isStreaming, streamingIds }: { item: StreamItem; participants: any[]; isStreaming: boolean; streamingIds: string[] }) {
  const msg = item.msg!
  const isUser = msg.participantId === 'user'
  const participant = participants.find((p) => p.id === msg.participantId)
  const color = isUser ? '#34d399' : participant?.color || '#6366f1'
  const typeCfg = typeLabels[msg.type] || typeLabels.system
  const isStreamingThis = isStreaming && item.id === 'streaming' && streamingIds.includes(msg.participantId)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className={`msg-block slide-up ${isUser ? 'msg-user' : 'msg-ai'}`}
      style={{ position: 'relative' }}
    >
      {/* 悬停复制按钮 */}
      {!isStreamingThis && msg.content && (
        <button
          className="btn-icon"
          onClick={handleCopy}
          title="复制"
          style={{
            position: 'absolute', top: 6, right: 6, width: 22, height: 22,
            opacity: 0, transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
        >
          {copied ? <Check size={11} style={{ color: 'var(--success)' }} /> : <Copy size={11} />}
        </button>
      )}
      {/* 头部 */}
      <div className="msg-header">
        <div className="msg-avatar" style={{ background: color }}>
          {(isUser ? 'U' : (msg.participantName || 'AI')[0]).toUpperCase()}
        </div>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{isUser ? '用户' : msg.participantName}</span>
        {!isUser && (
          <span className="badge" style={{ background: typeCfg.color + '22', color: typeCfg.color }}>{typeCfg.text}</span>
        )}
        {isStreamingThis && (
          <span className="dot-loading" style={{ marginLeft: 'auto' }}>
            <span></span><span></span><span></span>
          </span>
        )}
      </div>
      {/* 内容 */}
      <div className="md-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code: ({ inline, className, children, ...props }: any) => {
              const lang = className?.replace('language-', '') || 'text'
              if (inline) return <code {...props}>{children}</code>
              return (
                <pre>
                  <div className="code-header">
                    <span>{lang}</span>
                    <button
                      className="btn-icon"
                      style={{ width: 20, height: 20 }}
                      onClick={() => navigator.clipboard.writeText(String(children))}
                      title="复制"
                    >
                      <Copy size={11} />
                    </button>
                  </div>
                  <code className={className} {...props}>{children}</code>
                </pre>
              )
            },
          }}
        >
          {msg.content || ''}
        </ReactMarkdown>
        {isStreamingThis && (
          <span style={{ display: 'inline-block', width: 7, height: 14, background: 'var(--accent)', borderRadius: 1, animation: 'blink 1s infinite', marginLeft: 2, verticalAlign: 'text-bottom' }} />
        )}
      </div>
    </div>
  )
}

// ============ 工具调用卡片 ============
function ToolCard({ item }: { item: StreamItem }) {
  const [expanded, setExpanded] = useState(false)
  const Icon = toolIcons[item.toolName!] || Wrench
  const color = toolColors[item.toolName!] || '#9ca3af'
  const label = toolLabels[item.toolName!] || item.toolName
  const isPending = item.toolStatus === 'pending'

  const argSummary = (() => {
    const a = item.toolArgs || {}
    if (a.path) return a.path
    if (a.command) return a.command.length > 50 ? a.command.slice(0, 50) + '...' : a.command
    if (a.pattern) return a.pattern
    return ''
  })()

  return (
    <div className="tool-card slide-up" style={{ marginLeft: 27 }}>
      <div
        className="tool-header"
        onClick={() => !isPending && setExpanded(!expanded)}
        style={{ cursor: isPending ? 'default' : 'pointer' }}
      >
        <Icon size={13} style={{ color }} />
        <span style={{ fontWeight: 500 }}>{label}</span>
        {argSummary && (
          <span style={{ color: 'var(--fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontFamily: 'Consolas, monospace', fontSize: 10 }}>
            {argSummary}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {isPending ? (
          <Loader size={12} className="spin" style={{ color: 'var(--info)' }} />
        ) : item.toolStatus === 'error' ? (
          <X size={12} style={{ color: 'var(--error)' }} />
        ) : (
          <Check size={12} style={{ color: 'var(--success)' }} />
        )}
        {!isPending && (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
      </div>
      {expanded && item.toolResult && (
        <pre className="tool-result" style={{ color: item.toolStatus === 'error' ? '#fca5a5' : 'var(--fg)' }}>
          {item.toolResult}
        </pre>
      )}
    </div>
  )
}

// ============ 错误卡片 ============
function ErrorCard({ error }: { error: string | null }) {
  return (
    <div className="error-card">
      <AlertTriangle size={14} style={{ color: 'var(--error)', flexShrink: 0, marginTop: 1 }} />
      <div style={{ fontSize: 12, color: '#fca5a5', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {error || '发生错误'}
      </div>
    </div>
  )
}

// ============ 方案审查 ============
function ProposalReview({ proposal, onApprove, onReject, status }: { proposal: any; onApprove: () => void; onReject: () => void; status: string }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: 10, flexShrink: 0, maxHeight: '35%', overflow: 'auto', background: 'var(--bg-secondary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <FileCode size={15} style={{ color: '#a78bfa' }} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>修改方案</span>
        <span className="badge" style={{ background: '#a78bfa22', color: '#a78bfa' }}>{proposal.changes.length} 处</span>
        <div style={{ flex: 1 }} />
        {status === 'reviewing' && (
          <>
            <button className="btn" onClick={onApprove} style={{ background: 'var(--success)' }}>
              <Check size={13} /> 批准
            </button>
            <button className="btn-ghost btn" onClick={onReject}>
              <X size={13} /> 拒绝
            </button>
          </>
        )}
      </div>
      {proposal.summary && <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 8 }}>{proposal.summary}</div>}
      {proposal.changes.map((c: any, i: number) => (
        <div key={i} style={{ marginBottom: 4 }}>
          <div
            onClick={() => setExpanded(expanded === String(i) ? null : String(i))}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 5, cursor: 'pointer', background: 'var(--list-hover)' }}
          >
            <Wrench size={12} opacity={0.6} />
            <span style={{ fontSize: 12 }}>
              {c.action === 'create' ? '新建' : c.action === 'delete' ? '删除' : '修改'}: {c.filePath}
            </span>
            {expanded === String(i) ? <ChevronDown size={12} style={{ marginLeft: 'auto' }} /> : <ChevronRight size={12} style={{ marginLeft: 'auto' }} />}
          </div>
          {expanded === String(i) && (
            <pre style={{ fontSize: 11, padding: 8, background: 'var(--code-bg)', borderRadius: 5, overflow: 'auto', maxHeight: 200, marginTop: 4, fontFamily: 'Consolas, monospace' }}>
              {c.diff || c.content?.slice(0, 1000)}
            </pre>
          )}
        </div>
      ))}
    </div>
  )
}
