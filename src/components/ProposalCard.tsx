// 修改方案卡片
import { useState } from 'react'
import { CheckCircle2, XCircle, RefreshCw, FileCode, AlertTriangle } from 'lucide-react'
import { Button } from './ui'
import DiffView from './DiffView'
import { useDiscussionStore } from '@/stores/discussion'
import type { Proposal } from '../../shared/types'
import { cn } from '@/lib/utils'

export default function ProposalCard({
  proposal,
  discussionId,
}: {
  proposal: Proposal
  discussionId: string
}) {
  const { approve, reject, continueDiscussion, liveStatus } = useDiscussionStore()
  const [executing, setExecuting] = useState(false)
  const [results, setResults] = useState<string[] | null>(null)

  const handleApprove = async () => {
    setExecuting(true)
    try {
      const res = await approve(discussionId)
      setResults(res.results)
    } finally {
      setExecuting(false)
    }
  }

  const isExecuted = proposal.status === 'executed' || liveStatus === 'done'
  const isRejected = proposal.status === 'rejected' || liveStatus === 'rejected'

  return (
    <div className="rounded-2xl glass p-5 animate-slide-up">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15">
          <FileCode size={16} className="text-accent-light" />
        </div>
        <div>
          <h3 className="font-display text-sm font-semibold text-white">修改方案</h3>
          <p className="text-[10px] text-zinc-500">{proposal.changes.length} 项改动</p>
        </div>
      </div>

      {/* 方案摘要 */}
      <div className="rounded-xl bg-ink-900/60 border border-white/5 p-3 mb-3">
        <p className="text-xs text-zinc-300 leading-relaxed">{proposal.summary}</p>
      </div>

      {/* Diff 列表 */}
      <div className="space-y-3 mb-4">
        {proposal.changes.map((change) => (
          <DiffView key={change.id} change={change} />
        ))}
      </div>

      {/* 执行结果 */}
      {results && (
        <div className="rounded-xl bg-ink-900/60 border border-white/5 p-3 mb-4">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">执行结果</div>
          {results.map((r, i) => (
            <div key={i} className={cn('text-xs font-mono', r.startsWith('✓') ? 'text-emerald-400' : 'text-red-400')}>
              {r}
            </div>
          ))}
        </div>
      )}

      {/* 操作按钮 */}
      {proposal.status === 'pending' && !isExecuted && !isRejected && (
        <div className="flex items-center gap-2">
          <Button variant="success" size="sm" onClick={handleApprove} disabled={executing}>
            <CheckCircle2 size={14} />
            {executing ? '执行中...' : '批准并执行'}
          </Button>
          <Button variant="danger" size="sm" onClick={() => reject(discussionId)}>
            <XCircle size={14} />
            拒绝
          </Button>
          <Button variant="ghost" size="sm" onClick={() => continueDiscussion(discussionId)}>
            <RefreshCw size={14} />
            继续讨论
          </Button>
        </div>
      )}

      {isExecuted && !executing && (
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <CheckCircle2 size={14} />
          方案已执行,文件已修改
        </div>
      )}

      {isRejected && (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <AlertTriangle size={14} />
          方案已被拒绝
        </div>
      )}
    </div>
  )
}
