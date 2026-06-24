// 讨论消息气泡
import { cn } from '@/lib/utils'
import MarkdownRenderer from './MarkdownRenderer'
import type { DiscussionMessage, MessageType } from '../../shared/types'
import { BookOpen, GitCompare, Lightbulb, AlertCircle, RefreshCw, Sparkles, User, type LucideIcon } from 'lucide-react'

const typeConfig: Record<MessageType, { label: string; icon: LucideIcon; color: string }> = {
  familiarize: { label: '项目理解', icon: BookOpen, color: 'text-cyan-400 bg-cyan-500/10' },
  align: { label: '认知对齐', icon: GitCompare, color: 'text-teal-400 bg-teal-500/10' },
  idea: { label: '提案', icon: Lightbulb, color: 'text-amber-400 bg-amber-500/10' },
  critique: { label: '质疑', icon: AlertCircle, color: 'text-red-400 bg-red-500/10' },
  refine: { label: '完善', icon: RefreshCw, color: 'text-blue-400 bg-blue-500/10' },
  summary: { label: '总结', icon: Sparkles, color: 'text-accent-light bg-accent/10' },
  system: { label: '系统', icon: Sparkles, color: 'text-zinc-400 bg-white/5' },
  user: { label: '用户', icon: User, color: 'text-emerald-400 bg-emerald-500/10' },
}

function avatarColor(color?: string): string {
  return color || '#6366f1'
}

export default function MessageBubble({
  message,
  streaming = false,
  streamingText,
}: {
  message?: DiscussionMessage
  streaming?: boolean
  streamingText?: string
}) {
  const content = streaming ? streamingText : message?.content || ''
  const type = message?.type || 'idea'
  const config = typeConfig[type]
  const Icon = config.icon
  const name = streaming ? '生成中...' : message?.participantName || 'AI'
  const color = avatarColor(message?.participantName ? undefined : undefined)

  return (
    <div className="flex gap-3 animate-slide-up">
      {/* 头像 */}
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
        style={{ background: `linear-gradient(135deg, ${color}, ${color}dd)` }}
      >
        {name.charAt(0)}
      </div>

      {/* 内容 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-zinc-200">{name}</span>
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', config.color)}>
            <Icon size={10} />
            {config.label}
          </span>
        </div>
        <div className={cn('rounded-xl bg-ink-850/60 border border-white/5 px-4 py-3', streaming && 'stream-cursor')}>
          {content ? (
            <MarkdownRenderer content={content} />
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-zinc-600">
              <div className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
              <div className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" style={{ animationDelay: '0.2s' }} />
              <div className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
