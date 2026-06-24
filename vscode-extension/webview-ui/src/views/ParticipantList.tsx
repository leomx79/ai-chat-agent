// AI 参与方列表
import React, { useState, useEffect } from 'react'
import { Users, Plus, Trash2, X, Loader } from 'lucide-react'
import { useStore } from '../store'

// 角色预设
const ROLE_PRESETS: Record<string, { name: string; desc: string; color: string; systemPrompt: string }> = {
  architect: {
    name: '架构师',
    desc: '关注整体结构、设计模式、可维护性',
    color: '#6366f1',
    systemPrompt: '你是一位资深的软件架构师。你擅长从全局视角分析项目结构,关注模块划分、设计模式、依赖关系、可扩展性和可维护性。在讨论中,你负责评估方案的结构合理性,指出架构层面的风险,并提出更优的组织方式。',
  },
  reviewer: {
    name: '代码审查员',
    desc: '关注代码质量、边界条件、安全风险',
    color: '#ec4899',
    systemPrompt: '你是一位严格的代码审查员。你擅长发现潜在 bug、边界条件遗漏、安全漏洞和性能问题。在讨论中,你负责质疑其他AI的方案,检查是否有幻觉或臆测,确保所有修改都基于真实代码且有充分的理由。',
  },
  implementer: {
    name: '实现工程师',
    desc: '关注可行性、实现细节、具体代码',
    color: '#f59e0b',
    systemPrompt: '你是一位经验丰富的实现工程师。你擅长将抽象方案转化为具体代码,关注实现细节、API 用法、错误处理和测试。在讨论中,你负责评估方案的可行性,指出实现难点,并给出具体的代码建议。',
  },
  product: {
    name: '产品顾问',
    desc: '关注用户体验、需求合理性、优先级',
    color: '#10b981',
    systemPrompt: '你是一位产品顾问。你从用户角度思考问题,关注需求合理性、用户体验、功能优先级和业务价值。在讨论中,你负责确保方案真正解决用户问题,避免过度设计,并提出更简洁的替代方案。',
  },
  optimizer: {
    name: '性能优化师',
    desc: '关注性能、资源消耗、效率',
    color: '#06b6d4',
    systemPrompt: '你是一位性能优化专家。你擅长分析代码的时间复杂度、空间复杂度、I/O 开销和并发问题。在讨论中,你负责评估方案的性能影响,指出潜在瓶颈,并提出优化建议。',
  },
  tester: {
    name: '测试工程师',
    desc: '关注测试覆盖、异常场景、回归风险',
    color: '#8b5cf6',
    systemPrompt: '你是一位测试工程师。你擅长设计测试用例,关注边界条件、异常处理、回归风险和测试覆盖率。在讨论中,你负责评估方案的测试可行性,指出未覆盖的场景,并提出测试建议。',
  },
}

export function ParticipantList() {
  const { participants, providers, saveParticipant, deleteParticipant, fetchModels, modelLoading } = useStore()
  const [editing, setEditing] = useState<any | null>(null)

  return (
    <div style={{ overflow: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>AI 参与方 ({participants.length})</span>
        <button className="btn" style={{ padding: '2px 6px' }} onClick={() => setEditing({ name: '', providerId: '', model: '', color: '#6366f1', systemPrompt: '', temperature: 0.7, presetKey: '' })}>
          <Plus size={12} />
        </button>
      </div>

      {participants.length === 0 && !editing && (
        <div className="empty">
          <Users size={28} opacity={0.3} />
          <p style={{ marginTop: 8, fontSize: 12 }}>暂无AI参与方</p>
        </div>
      )}

      {participants.map((p) => {
        const provider = providers.find((pr) => pr.id === p.providerId)
        return (
          <div key={p.id} className="card" style={{ cursor: 'default' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>{p.name}</span>
              <button className="btn-ghost btn" style={{ padding: '2px 4px' }} onClick={() => setEditing(p)}>
                <span style={{ fontSize: 10 }}>编辑</span>
              </button>
              <button className="btn-ghost btn" style={{ padding: '2px 4px' }} onClick={() => deleteParticipant(p.id)}>
                <Trash2 size={11} />
              </button>
            </div>
            <div style={{ fontSize: 10, opacity: 0.5, marginTop: 3 }}>
              {provider?.name || '未知'} · {p.model}
            </div>
            {p.systemPrompt && (
              <div style={{ fontSize: 10, opacity: 0.3, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.systemPrompt}
              </div>
            )}
          </div>
        )
      })}

      {editing && <EditModal data={editing} providers={providers} modelLoading={modelLoading} fetchModels={fetchModels} onClose={() => setEditing(null)} onSave={(d) => { saveParticipant(d); setEditing(null) }} />}
    </div>
  )
}

function EditModal({ data, providers, modelLoading, fetchModels, onClose, onSave }: { data: any; providers: any[]; modelLoading: string | null; fetchModels: (id: string) => void; onClose: () => void; onSave: (d: any) => void }) {
  const [form, setForm] = useState(data)
  const provider = providers.find((p) => p.id === form.providerId)
  const isLoadingModels = modelLoading === form.providerId

  // 选择提供商时自动拉取模型
  useEffect(() => {
    if (form.providerId && provider && (!provider.models || provider.models.length === 0)) {
      fetchModels(form.providerId)
    }
  }, [form.providerId])

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}>
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px 8px 0 0', padding: 12, width: '100%', maxHeight: '80vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{data.id ? '编辑AI' : '创建AI'}</span>
          <button className="btn-ghost btn" style={{ padding: '2px 4px' }} onClick={onClose}><X size={14} /></button>
        </div>

        <div>
          <label className="label">角色预设</label>
          <select className="input" value={form.presetKey || ''} onChange={(e) => {
            const preset = ROLE_PRESETS[e.target.value]
            if (preset) {
              setForm({ ...form, presetKey: e.target.value, name: preset.name, systemPrompt: preset.systemPrompt, color: preset.color })
            } else {
              setForm({ ...form, presetKey: '', name: '', systemPrompt: '' })
            }
          }}>
            <option value="">自定义</option>
            {Object.entries(ROLE_PRESETS).map(([key, p]) => (
              <option key={key} value={key}>{p.name} - {p.desc}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">名称</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, presetKey: '' })} placeholder="如:架构师" />
        </div>

        <div>
          <label className="label">API 提供商</label>
          <select className="input" value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value, model: '' })}>
            <option value="">请选择...</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div>
          <label className="label">模型 {isLoadingModels && <span style={{ opacity: 0.5 }}>拉取中...</span>}</label>
          <select className="input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} disabled={!provider || isLoadingModels || !provider.models?.length}>
            <option value="">
              {!provider ? '请先选择提供商' : isLoadingModels ? '正在拉取模型...' : !provider.models?.length ? '无可用模型,点击刷新' : '请选择...'}
            </option>
            {provider?.models?.map((m: any) => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}
          </select>
          {provider && !isLoadingModels && (!provider.models || provider.models.length === 0) && (
            <button className="btn-ghost btn" style={{ marginTop: 4, padding: '2px 8px', fontSize: 10 }} onClick={() => fetchModels(provider.id)}>
              手动拉取模型
            </button>
          )}
        </div>

        <div>
          <label className="label">角色提示词 (可选)</label>
          <textarea className="input" style={{ minHeight: 60, resize: 'vertical' }} value={form.systemPrompt} onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })} placeholder="定义这个AI的角色和专长..." />
        </div>

        <div>
          <label className="label">颜色标识</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6'].map((c) => (
              <button key={c} style={{ width: 18, height: 18, borderRadius: '50%', background: c, border: form.color === c ? '2px solid white' : '2px solid transparent', cursor: 'pointer' }} onClick={() => setForm({ ...form, color: c })} />
            ))}
          </div>
        </div>

        <button className="btn" onClick={() => onSave(form)} disabled={!form.name || !form.providerId || !form.model} style={{ marginTop: 4 }}>
          保存
        </button>
      </div>
    </div>
  )
}
