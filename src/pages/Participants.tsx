import { useEffect, useState } from 'react'
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  Bot,
  Thermometer,
  Loader2,
} from 'lucide-react'
import {
  PageHeader,
  Button,
  Input,
  Select,
  Textarea,
  Modal,
  Badge,
  EmptyState,
} from '@/components/ui'
import { useParticipantStore } from '@/stores/participant'
import { useProviderStore } from '@/stores/provider'
import { cn } from '@/lib/utils'
import type { Participant, RolePreset } from '../../shared/types'

const PRESET_COLORS = [
  '#6366f1', '#818cf8', '#a78bfa', '#f472b6', '#fb7185',
  '#34d399', '#60a5fa', '#fbbf24', '#f87171', '#22d3ee',
]

const emptyForm = {
  name: '',
  color: PRESET_COLORS[0],
  providerId: '',
  model: '',
  systemPrompt: '',
  temperature: 0.7,
}

export default function Participants() {
  const { participants, presets, fetchAll, fetchPresets, create, update, remove } =
    useParticipantStore()
  const { providers, fetchAll: fetchProviders, fetchModels } = useProviderStore()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Participant | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [fetchingModels, setFetchingModels] = useState(false)

  useEffect(() => {
    fetchAll()
    fetchProviders()
    fetchPresets()
  }, [fetchAll, fetchProviders, fetchPresets])

  const selectedProvider = providers.find((p) => p.id === form.providerId) ?? null

  // 选择提供商后若没有模型则自动拉取
  const ensureModels = async (providerId: string) => {
    const prov = providers.find((p) => p.id === providerId)
    if (prov && prov.models.length === 0) {
      setFetchingModels(true)
      try {
        await fetchModels(providerId)
      } catch {
        // 忽略错误
      } finally {
        setFetchingModels(false)
      }
    }
  }

  const openCreate = () => {
    setEditing(null)
    const first = providers[0]
    setForm({
      ...emptyForm,
      providerId: first?.id ?? '',
      model: first?.models.find((m) => m.enabled)?.id ?? first?.models[0]?.id ?? '',
    })
    setModalOpen(true)
    if (first) ensureModels(first.id)
  }

  const openEdit = (p: Participant) => {
    setEditing(p)
    setForm({
      name: p.name,
      color: p.color ?? PRESET_COLORS[0],
      providerId: p.providerId,
      model: p.model,
      systemPrompt: p.systemPrompt,
      temperature: p.temperature,
    })
    setModalOpen(true)
    ensureModels(p.providerId)
  }

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.providerId || !form.model) return
    setSaving(true)
    try {
      const data = { ...form, enabled: editing?.enabled ?? true }
      if (editing) {
        await update(editing.id, data)
      } else {
        await create(data)
      }
      setModalOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (p: Participant) => {
    if (confirm(`确定删除「${p.name}」吗？`)) {
      await remove(p.id)
    }
  }

  const toggleEnabled = async (p: Participant) => {
    await update(p.id, { enabled: !p.enabled })
  }

  const applyPreset = (preset: RolePreset) => {
    setForm((f) => ({
      ...f,
      name: f.name || preset.name,
      color: preset.color,
      systemPrompt: preset.systemPrompt,
    }))
  }

  const providerName = (id: string) => providers.find((p) => p.id === id)?.name ?? '未知'

  return (
    <div className="min-h-full">
      <PageHeader
        title="AI 参与方"
        subtitle="配置参与圆桌讨论的 AI 角色"
        action={
          <Button variant="primary" onClick={openCreate}>
            <Plus size={16} /> 添加AI
          </Button>
        }
      />

      <div className="p-8">
        {participants.length === 0 ? (
          <EmptyState
            icon={Users}
            title="还没有 AI 参与方"
            desc="添加参与讨论的 AI 角色，配置其提供商与人格设定"
            action={
              <Button variant="primary" onClick={openCreate}>
                <Plus size={16} /> 添加AI
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {participants.map((p) => {
              const color = p.color ?? PRESET_COLORS[0]
              return (
                <div
                  key={p.id}
                  className={cn(
                    'glass glass-hover rounded-2xl p-5 flex flex-col gap-3 transition-opacity',
                    !p.enabled && 'opacity-50',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-sm font-bold"
                        style={{ background: `${color}22`, color }}
                      >
                        {p.name.charAt(0).toUpperCase()}
                        <span
                          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-ink-850"
                          style={{ background: color }}
                        />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-display text-sm font-semibold text-white truncate">
                          {p.name}
                        </h3>
                        <span className="text-[11px] text-zinc-500">
                          {providerName(p.providerId)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleEnabled(p)}
                      className={cn(
                        'relative h-5 w-9 rounded-full transition-colors shrink-0',
                        p.enabled ? 'bg-accent' : 'bg-ink-700',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                          p.enabled ? 'translate-x-4' : 'translate-x-0.5',
                        )}
                      />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge color="indigo">
                      <Bot size={10} /> {p.model}
                    </Badge>
                  </div>

                  {p.systemPrompt ? (
                    <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
                      {p.systemPrompt}
                    </p>
                  ) : null}

                  <div className="flex items-center gap-1.5 pt-1 mt-auto">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                      <Pencil size={13} /> 编辑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto text-red-400/70 hover:text-red-400"
                      onClick={() => handleDelete(p)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 创建/编辑表单 */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? '编辑 AI 参与方' : '添加 AI 参与方'}
        width="max-w-xl"
      >
        <div className="space-y-4">
          {/* 角色预设 */}
          {presets.length > 0 ? (
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2">角色模板</label>
              <div className="flex flex-wrap gap-1.5">
                {presets.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => applyPreset(preset)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-ink-850 border border-white/5 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-accent/30 hover:text-white transition-colors"
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: preset.color }} />
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <Input
            label="名称"
            placeholder="例如：架构师"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2">标识颜色</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setForm({ ...form, color: c })}
                  className={cn(
                    'h-7 w-7 rounded-lg transition-all hover:scale-110',
                    form.color === c && 'ring-2 ring-white ring-offset-2 ring-offset-ink-900',
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="提供商"
              value={form.providerId}
              onChange={(e) => {
                const pid = e.target.value
                const prov = providers.find((p) => p.id === pid)
                const firstModel =
                  prov?.models.find((m) => m.enabled)?.id ?? prov?.models[0]?.id ?? ''
                setForm({ ...form, providerId: pid, model: firstModel })
                if (pid) ensureModels(pid)
              }}
            >
              <option value="">请选择</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-400">模型</label>
              {fetchingModels ? (
                <div className="flex items-center gap-2 rounded-xl bg-ink-850 border border-white/5 px-3.5 py-2.5 text-sm text-zinc-500">
                  <Loader2 size={14} className="animate-spin" />
                  拉取模型中...
                </div>
              ) : (
                <Select
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  disabled={!selectedProvider || selectedProvider.models.length === 0}
                >
                  <option value="">请选择</option>
                  {(selectedProvider?.models ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          </div>

          <Textarea
            label="系统提示词"
            placeholder="描述该 AI 的角色、专长与行为准则..."
            rows={4}
            value={form.systemPrompt}
            onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
          />

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-zinc-400">温度 (Temperature)</label>
              <span className="text-xs font-mono text-accent-light">
                {form.temperature.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Thermometer size={14} className="text-zinc-600 shrink-0" />
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={form.temperature}
                onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) })}
                className="flex-1 accent-accent"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={saving || !form.name.trim() || !form.providerId || !form.model}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {editing ? '保存' : '创建'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
