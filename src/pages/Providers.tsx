import { useEffect, useState } from 'react'
import {
  Server,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Plug,
  CheckCircle2,
  XCircle,
  Loader2,
  Globe,
  Cpu,
} from 'lucide-react'
import {
  PageHeader,
  Button,
  Input,
  Modal,
  Badge,
  EmptyState,
} from '@/components/ui'
import { useProviderStore } from '@/stores/provider'
import { cn } from '@/lib/utils'
import type { Provider, ProviderType, ProtocolType } from '../../shared/types'

const TYPE_LABELS: Record<ProviderType, string> = {
  relay: '中转站',
  official: '官方',
  'coding-plan': 'Coding Plan',
}

const TYPE_COLOR: Record<ProviderType, 'indigo' | 'green' | 'amber'> = {
  relay: 'indigo',
  official: 'green',
  'coding-plan': 'amber',
}

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'

const emptyForm = {
  name: 'DeepSeek',
  type: 'official' as ProviderType,
  protocol: 'openai' as ProtocolType,
  baseUrl: DEEPSEEK_BASE_URL,
  apiKey: '',
}

export default function Providers() {
  const { providers, loading, fetchAll, create, update, remove, fetchModels, test } =
    useProviderStore()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Provider | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [modelsProviderId, setModelsProviderId] = useState<string | null>(null)
  const [fetchingModels, setFetchingModels] = useState(false)
  const [testStates, setTestStates] = useState<
    Record<string, 'loading' | { ok: boolean; msg: string }>
  >({})

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const modelsProvider = providers.find((p) => p.id === modelsProviderId) ?? null

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const openEdit = (p: Provider) => {
    setEditing(p)
    setForm({
      name: p.name,
      type: p.type,
      protocol: p.protocol,
      baseUrl: p.baseUrl,
      apiKey: p.apiKey,
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editing) {
        await update(editing.id, form)
      } else {
        await create(form)
      }
      setModalOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (p: Provider) => {
    if (confirm(`确定删除「${p.name}」吗？`)) {
      await remove(p.id)
    }
  }

  const handleFetchModels = async (p: Provider) => {
    setModelsProviderId(p.id)
    setFetchingModels(true)
    try {
      await fetchModels(p.id)
    } finally {
      setFetchingModels(false)
    }
  }

  const toggleModel = async (modelId: string) => {
    if (!modelsProvider) return
    const updatedModels = modelsProvider.models.map((m) =>
      m.id === modelId ? { ...m, enabled: !m.enabled } : m,
    )
    await update(modelsProvider.id, { models: updatedModels })
  }

  const handleTest = async (p: Provider) => {
    setTestStates((s) => ({ ...s, [p.id]: 'loading' }))
    try {
      const result = await test(p.id)
      setTestStates((s) => ({ ...s, [p.id]: { ok: result.ok, msg: result.message } }))
    } catch (err) {
      setTestStates((s) => ({
        ...s,
        [p.id]: { ok: false, msg: err instanceof Error ? err.message : '测试失败' },
      }))
    }
  }

  return (
    <div className="min-h-full">
      <PageHeader
        title="API 提供商"
        subtitle="DeepSeek API 接入与模型管理"
        action={
          <Button variant="primary" onClick={openCreate}>
            <Plus size={16} /> 添加 DeepSeek Key
          </Button>
        }
      />

      <div className="p-8">
        {providers.length === 0 && !loading ? (
          <EmptyState
            icon={Server}
            title="还没有配置 DeepSeek API"
            desc="添加你的 DeepSeek API Key 以启用 AI 对话能力"
            action={
              <Button variant="primary" onClick={openCreate}>
                <Plus size={16} /> 添加 DeepSeek Key
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {providers.map((p) => {
              const ts = testStates[p.id]
              const enabledCount = p.models.filter((m) => m.enabled).length
              return (
                <div key={p.id} className="glass glass-hover rounded-2xl p-5 flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent-light">
                        <Server size={16} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-display text-sm font-semibold text-white truncate">
                          {p.name}
                        </h3>
                        <span className="text-[11px] text-zinc-500 font-mono">{p.protocol}</span>
                      </div>
                    </div>
                    <Badge color={TYPE_COLOR[p.type]}>{TYPE_LABELS[p.type]}</Badge>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2 text-zinc-400">
                      <Globe size={12} className="text-zinc-600 shrink-0" />
                      <span className="truncate font-mono">{p.baseUrl || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-400">
                      <Cpu size={12} className="text-zinc-600 shrink-0" />
                      <span>
                        {enabledCount}/{p.models.length} 个模型
                      </span>
                    </div>
                  </div>

                  {ts && ts !== 'loading' && (
                    <div
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px]',
                        ts.ok
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-red-500/10 text-red-400',
                      )}
                    >
                      {ts.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                      <span className="truncate">{ts.msg}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 pt-1 mt-auto">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                      <Pencil size={13} /> 编辑
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleFetchModels(p)}>
                      <RefreshCw size={13} /> 模型
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTest(p)}
                      disabled={ts === 'loading'}
                    >
                      {ts === 'loading' ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Plug size={13} />
                      )}
                      测试
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
        title={editing ? '编辑提供商' : '添加提供商'}
      >
        <div className="space-y-4">
          {/* DeepSeek 固定标识 */}
          <div className="flex items-center gap-2.5 rounded-xl bg-accent/10 border border-accent/20 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20">
              <Cpu size={16} className="text-accent-light" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">DeepSeek API</div>
              <div className="text-[10px] text-zinc-500 font-mono">{DEEPSEEK_BASE_URL}</div>
            </div>
          </div>
          <Input
            label="名称"
            placeholder="例如：DeepSeek 主账号"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="API Key"
            type="password"
            placeholder="sk-..."
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
          />
          <p className="text-[11px] text-zinc-600 leading-relaxed">
            前往
            <a
              href="https://platform.deepseek.com/api_keys"
              target="_blank"
              rel="noreferrer"
              className="text-accent-light hover:underline mx-1"
            >
              DeepSeek 开放平台
            </a>
            获取 API Key。同一账号可创建多个 Key 用于不同 AI 角色。
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={saving || !form.name.trim() || !form.apiKey.trim()}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {editing ? '保存' : '创建'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 模型列表 */}
      <Modal
        open={!!modelsProviderId}
        onClose={() => setModelsProviderId(null)}
        title={`模型管理 - ${modelsProvider?.name ?? ''}`}
      >
        {fetchingModels ? (
          <div className="flex items-center justify-center py-10 text-zinc-500">
            <Loader2 size={20} className="animate-spin mr-2" /> 正在拉取模型...
          </div>
        ) : modelsProvider && modelsProvider.models.length > 0 ? (
          <div className="space-y-1.5">
            {modelsProvider.models.map((m) => (
              <label
                key={m.id}
                className="flex items-center gap-3 rounded-xl bg-ink-850 border border-white/5 px-3.5 py-2.5 cursor-pointer hover:border-accent/20 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={!!m.enabled}
                  onChange={() => toggleModel(m.id)}
                  className="h-4 w-4 rounded accent-accent"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white font-mono truncate">{m.id}</div>
                  {m.contextWindow ? (
                    <div className="text-[10px] text-zinc-600">
                      上下文 {m.contextWindow.toLocaleString()}
                    </div>
                  ) : null}
                </div>
              </label>
            ))}
            <div className="flex justify-end gap-2 pt-4 mt-2 border-t border-white/5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => modelsProvider && handleFetchModels(modelsProvider)}
              >
                <RefreshCw size={13} /> 重新拉取
              </Button>
              <Button variant="primary" size="sm" onClick={() => setModelsProviderId(null)}>
                完成
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-10 text-sm text-zinc-500">
            暂无模型，请检查 API 配置后重试
          </div>
        )}
      </Modal>
    </div>
  )
}
