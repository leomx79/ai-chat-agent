import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  MessagesSquare,
  Users,
  Repeat,
  Clock,
  FolderGit2,
} from 'lucide-react'
import {
  Button,
  Badge,
  PageHeader,
  EmptyState,
  Modal,
  Input,
  Select,
  Textarea,
} from '@/components/ui'
import { cn } from '@/lib/utils'
import { useDiscussionStore } from '@/stores/discussion'
import { useProjectStore } from '@/stores/project'
import { useParticipantStore } from '@/stores/participant'
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

export default function Discussions() {
  const navigate = useNavigate()
  const { discussions, fetchAll, create } = useDiscussionStore()
  const { projects, fetchAll: fetchProjects } = useProjectStore()
  const { participants, fetchAll: fetchParticipants } = useParticipantStore()

  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    projectId: '',
    topic: '',
    instruction: '',
    filePaths: '',
    participantIds: [] as string[],
    maxRounds: 3,
    mode: 'roundtable' as 'roundtable' | 'chat',
  })

  useEffect(() => {
    fetchAll()
    fetchProjects()
    fetchParticipants()
  }, [fetchAll, fetchProjects, fetchParticipants])

  const sorted = [...discussions].sort((a, b) => b.updatedAt - a.updatedAt)
  const enabledParticipants = participants.filter((p) => p.enabled)
  const projectName = (id: string) =>
    projects.find((p) => p.id === id)?.name || '未知项目'

  const toggleParticipant = (id: string) => {
    setForm((f) => ({
      ...f,
      participantIds: f.participantIds.includes(id)
        ? f.participantIds.filter((p) => p !== id)
        : [...f.participantIds, id],
    }))
  }

  const resetForm = () =>
    setForm({
      projectId: '',
      topic: '',
      instruction: '',
      filePaths: '',
      participantIds: [],
      maxRounds: 3,
      mode: 'roundtable',
    })

  const handleSubmit = async () => {
    if (!form.projectId || !form.topic.trim() || form.participantIds.length < 2) return
    setSubmitting(true)
    try {
      const filePaths = form.filePaths
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
      const discussion = await create({
        projectId: form.projectId,
        topic: form.topic.trim(),
        context: { filePaths, instruction: form.instruction.trim() },
        participantIds: form.participantIds,
        maxRounds: form.maxRounds,
        mode: form.mode,
      })
      resetForm()
      setModalOpen(false)
      navigate(`/discussions/${discussion.id}`)
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit =
    !!form.projectId &&
    form.topic.trim().length > 0 &&
    form.participantIds.length >= 2 &&
    !submitting

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="圆桌讨论"
        subtitle="发起多 AI 协作讨论，汇聚不同视角的智慧"
        action={
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            <Plus size={16} />
            发起新讨论
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {sorted.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title="还没有讨论记录"
            desc="发起一场圆桌讨论，让多个 AI 参与方围绕你的任务展开协作"
            action={
              <Button variant="primary" onClick={() => setModalOpen(true)}>
                <Plus size={16} />
                发起新讨论
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3">
            {sorted.map((d) => {
              const cfg = STATUS_CONFIG[d.status]
              return (
                <div
                  key={d.id}
                  onClick={() => navigate(`/discussions/${d.id}`)}
                  className="glass glass-hover rounded-2xl p-5 cursor-pointer transition-all duration-200 group"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge color={cfg.color}>{cfg.label}</Badge>
                    <Badge color={d.mode === 'chat' ? 'blue' : 'indigo'}>
                      {d.mode === 'chat' ? '自由对话' : '圆桌会议'}
                    </Badge>
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="发起新讨论"
        width="max-w-2xl"
      >
        <div className="space-y-4">
          {/* 模式选择 */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2">讨论模式</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setForm({ ...form, mode: 'roundtable' })}
                className={cn(
                  'flex flex-col gap-1 rounded-xl border p-3 text-left transition-all',
                  form.mode === 'roundtable'
                    ? 'border-accent/30 bg-accent/10'
                    : 'border-white/5 bg-ink-850 hover:bg-ink-800',
                )}
              >
                <span className="text-sm font-medium text-white">闭门圆桌会议</span>
                <span className="text-[10px] text-zinc-500">AI自动熟悉项目、对齐认知、多轮讨论后生成方案</span>
              </button>
              <button
                onClick={() => setForm({ ...form, mode: 'chat' })}
                className={cn(
                  'flex flex-col gap-1 rounded-xl border p-3 text-left transition-all',
                  form.mode === 'chat'
                    ? 'border-accent/30 bg-accent/10'
                    : 'border-white/5 bg-ink-850 hover:bg-ink-800',
                )}
              >
                <span className="text-sm font-medium text-white">自由对话</span>
                <span className="text-[10px] text-zinc-500">你与多个AI像群聊一样实时对话,随时生成方案</span>
              </button>
            </div>
          </div>

          <Select
            label="关联项目"
            value={form.projectId}
            onChange={(e) => setForm({ ...form, projectId: e.target.value })}
          >
            <option value="">请选择项目...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>

          <Input
            label="讨论主题"
            placeholder="例如：如何优化首页加载性能"
            value={form.topic}
            onChange={(e) => setForm({ ...form, topic: e.target.value })}
          />

          <Textarea
            label="任务说明"
            placeholder="描述你希望讨论方解决的问题或目标..."
            rows={3}
            value={form.instruction}
            onChange={(e) => setForm({ ...form, instruction: e.target.value })}
          />

          <Textarea
            label="相关文件路径（逗号或换行分隔）"
            placeholder={form.projectId ? 'src/index.ts, src/App.tsx' : '请先选择项目'}
            rows={2}
            value={form.filePaths}
            onChange={(e) => setForm({ ...form, filePaths: e.target.value })}
          />

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-400">
              参与方（已选 {form.participantIds.length} / 至少 2 位）
            </label>
            <div className="grid grid-cols-2 gap-2">
              {enabledParticipants.map((p) => {
                const checked = form.participantIds.includes(p.id)
                return (
                  <label
                    key={p.id}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer transition-all',
                      checked
                        ? 'border-accent/30 bg-accent/10'
                        : 'border-white/5 bg-ink-850 hover:bg-ink-800',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleParticipant(p.id)}
                      className="accent-[#6366f1]"
                    />
                    <span className="text-sm text-zinc-200 truncate">{p.name}</span>
                  </label>
                )
              })}
              {enabledParticipants.length === 0 && (
                <p className="col-span-2 text-xs text-zinc-600">
                  暂无可用参与方，请先在「AI 参与方」中启用
                </p>
              )}
            </div>
          </div>

          {form.mode === 'roundtable' && (
            <Select
              label="最大讨论轮数"
              value={form.maxRounds}
              onChange={(e) => setForm({ ...form, maxRounds: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} 轮
                </option>
              ))}
            </Select>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
              {submitting ? '创建中...' : form.mode === 'chat' ? '开始对话' : '开始讨论'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
