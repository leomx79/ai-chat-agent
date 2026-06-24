// Diff 视图组件
import { cn } from '@/lib/utils'
import { FilePlus, FileEdit, FileX } from 'lucide-react'
import type { FileChange } from '../../shared/types'

function DiffLine({ line }: { line: string }) {
  const type = line.startsWith('+++') || line.startsWith('---')
    ? 'header'
    : line.startsWith('+')
    ? 'add'
    : line.startsWith('-')
    ? 'del'
    : 'context'

  return (
    <div
      className={cn(
        'px-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all',
        type === 'add' && 'diff-add',
        type === 'del' && 'diff-del',
        type === 'context' && 'diff-context',
        type === 'header' && 'text-accent-light font-semibold',
      )}
    >
      {line || '\u00A0'}
    </div>
  )
}

export default function DiffView({ change }: { change: FileChange }) {
  const actionConfig = {
    create: { icon: FilePlus, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: '新建' },
    modify: { icon: FileEdit, color: 'text-amber-400', bg: 'bg-amber-500/10', label: '修改' },
    delete: { icon: FileX, color: 'text-red-400', bg: 'bg-red-500/10', label: '删除' },
  }
  const config = actionConfig[change.action]
  const Icon = config.icon

  const diffLines = change.diff ? change.diff.split('\n').slice(2) : []

  return (
    <div className="rounded-xl border border-white/5 overflow-hidden">
      {/* 文件头 */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-ink-850 border-b border-white/5">
        <div className={cn('flex h-6 w-6 items-center justify-center rounded-md', config.bg)}>
          <Icon size={13} className={config.color} />
        </div>
        <code className="text-xs text-zinc-300 font-mono flex-1 truncate">{change.filePath}</code>
        <span className={cn('text-[10px] px-2 py-0.5 rounded-full', config.bg, config.color)}>
          {config.label}
        </span>
      </div>

      {/* 理由 */}
      {change.reason && (
        <div className="px-4 py-2 bg-ink-900/50 text-[11px] text-zinc-500 border-b border-white/5">
          <span className="text-zinc-600">理由: </span>
          {change.reason}
        </div>
      )}

      {/* Diff 内容 */}
      {change.action === 'delete' ? (
        <div className="px-4 py-3 text-xs text-zinc-600 italic">文件将被删除</div>
      ) : change.diff ? (
        <div className="bg-ink-950 py-2 max-h-96 overflow-y-auto">
          {diffLines.map((line, i) => (
            <DiffLine key={i} line={line} />
          ))}
        </div>
      ) : (
        <div className="bg-ink-950 py-2 max-h-96 overflow-y-auto">
          <div className="px-3 py-1 text-[10px] text-zinc-600 uppercase tracking-wide">完整内容</div>
          {change.content.split('\n').map((line, i) => (
            <div key={i} className="px-3 font-mono text-[11px] leading-relaxed text-emerald-300/70 whitespace-pre-wrap break-all">
              + {line || '\u00A0'}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
