import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  History as HistoryIcon,
  Users,
  Repeat,
  Clock,
  FolderGit2,
} from 'lucide-react'
import { Badge, PageHeader, EmptyState } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useDiscussionStore } from '@/stores/discussion'
import { useProjectStore } from '@/stores/project'
import type { DiscussionStatus } from '../../shared/types'

const STATUS_CONFIG: Record<
  DiscussionStatus,
  { label: string; color: 'amber' | 'blue' | 'indigo' | 'green' | 'red' | 'default' }
> = {
  discussing: { label: '讨论中', color: 'amber' },
  consensus: { label: '已达成共识', color: 'blue' },
  proposing: { label: '提案中', color: 'indigo' },
  reviewing: { label: '审核中', color: 'indigo' },
  executing: { label: '执行中', color: 'blue' },
  done: { label: '已完成', color: 'green' },
  rejected: { label: '已拒绝', color: 'red' },
}

type FilterKey = 'all' | 'discussing' | 'done' | 'rejected'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'discussing', label: '讨论中' },
  { key: 'done', label: '已完成' },
  { key: 'rejected', label: '已拒绝' },
]

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return '刚刚'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}小时前`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}天前`
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export default function History() {
  const navigate = useNavigate()
  const { discussions, fetchAll } = useDiscussionStore()
  const { projects, fetchAll: fetchProjects } = useProjectStore()
  const [filter, setFilter] = useState<FilterKey>('all')

  useEffect(() => {
    fetchAll()
    fetchProjects()
  }, [fetchAll, fetchProjects])

  const sorted = [...discussions].sort((a, b) => b.updatedAt - a.updatedAt)
  const filtered =
    filter === 'all' ? sorted : sorted.filter((d) => d.status === filter)
  const projectName = (id: string) =>
    projects.find((p) => p.id === id)?.name || '未知项目'

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="历史记录" subtitle="回顾过往的圆桌讨论与决策" />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="flex items-center gap-2 mb-5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                filter === f.key
                  ? 'bg-accent/15 text-accent-light border border-accent/20'
                  : 'bg-ink-800 text-zinc-500 hover:text-zinc-300 border border-white/5',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={HistoryIcon}
            title={filter === 'all' ? '暂无历史记录' : '该状态下暂无记录'}
            desc={
              filter === 'all'
                ? '过往的圆桌讨论会在此留存，便于随时回顾'
                : '切换筛选条件查看其它讨论'
            }
          />
        ) : (
          <div className="grid gap-3">
            {filtered.map((d) => {
              const cfg = STATUS_CONFIG[d.status]
              return (
                <div
                  key={d.id}
                  onClick={() => navigate(`/discussions/${d.id}`)}
                  className="glass glass-hover rounded-2xl p-5 cursor-pointer transition-all duration-200 group"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge color={cfg.color}>{cfg.label}</Badge>
                    <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                      <FolderGit2 size={12} />
                      {projectName(d.projectId)}
                    </span>
                  </div>
                  <h3 className="font-display text-base font-semibold text-white truncate group-hover:text-accent-light transition-colors">
                    {d.topic}
                  </h3>
                  <div className="flex items-center gap-4 mt-3 text-[11px] text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Users size={12} />
                      {d.participantIds.length} 位参与方
                    </span>
                    <span className="flex items-center gap-1">
                      <Repeat size={12} />
                      {d.currentRound}/{d.maxRounds} 轮
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {formatRelative(d.createdAt)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
