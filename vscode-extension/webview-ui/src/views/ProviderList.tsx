// 预设提供商 (移植自 Cline 的多 Provider 支持)
const PROVIDER_PRESETS = [
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', note: 'deepseek-chat, deepseek-reasoner' },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', note: 'gpt-4o, gpt-4o-mini, o1, o3' },
  { name: 'Anthropic (OpenAI兼容)', baseUrl: 'https://api.anthropic.com/v1', note: 'claude-sonnet-4-20250514 (需兼容层)' },
  { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', note: '聚合 100+ 模型' },
  { name: 'Google Gemini (OpenAI兼容)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', note: 'gemini-2.5-pro, gemini-2.5-flash' },
  { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', note: '超快推理, llama/mixtral' },
  { name: 'Ollama (本地)', baseUrl: 'http://localhost:11434/v1', note: '本地模型, 无需 API Key' },
  { name: 'LM Studio (本地)', baseUrl: 'http://localhost:1234/v1', note: '本地模型' },
  { name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', note: '国内聚合, Qwen/DeepSeek/GLM' },
  { name: '月之暗面 (Moonshot)', baseUrl: 'https://api.moonshot.cn/v1', note: 'moonshot-v1系列' },
  { name: '通义千问 (Qwen)', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', note: 'qwen-turbo/plus/max' },
  { name: '智谱 (GLM)', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', note: 'glm-4, glm-4-flash' },
]

// 提供商管理 - 多 LLM Provider 配置
import React, { useState } from 'react'
import { Plus, Trash2, RefreshCw, Key, Loader, Wifi, CheckCircle, XCircle } from 'lucide-react'
import { useStore } from '../store'

export function ProviderList() {
  const { providers, saveProvider, deleteProvider, fetchModels, testProvider, modelLoading, testResult } = useStore()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com/v1')
  const [testing, setTesting] = useState<string | null>(null)

  const handlePresetSelect = (preset: typeof PROVIDER_PRESETS[0]) => {
    setName(preset.name)
    setBaseUrl(preset.baseUrl)
  }

  const handleSave = () => {
    if (!apiKey.trim() && !baseUrl.includes('localhost')) return
    saveProvider({
      name: name.trim() || 'Custom Provider',
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim() || 'local',
      protocol: 'openai',
      type: 'official',
    })
    setName('')
    setApiKey('')
    setBaseUrl('https://api.deepseek.com/v1')
    setShowForm(false)
  }

  const handleTest = (id: string) => {
    setTesting(id)
    testProvider(id)
    setTimeout(() => setTesting(null), 8000)
  }

  return (
    <div style={{ overflow: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, opacity: 0.7 }}>LLM Providers</span>
        <button className="btn" onClick={() => setShowForm(!showForm)} style={{ padding: '2px 6px' }}>
          <Plus size={12} />
        </button>
      </div>

      {showForm && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, border: '1px solid var(--border)', borderRadius: 6 }}>
          <div>
            <label className="label">快速选择预设</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {PROVIDER_PRESETS.map((p) => (
                <button key={p.name} className="btn" style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => handlePresetSelect(p)}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">名称</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="DeepSeek" />
          </div>
          <div>
            <label className="label">Base URL</label>
            <input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com/v1" />
          </div>
          <div>
            <label className="label">API Key</label>
            <input className="input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-... (本地模型可留空)" />
          </div>
          <button className="btn" onClick={handleSave} disabled={!apiKey.trim() && !baseUrl.includes('localhost')}>保存</button>
        </div>
      )}

      {providers.length === 0 && !showForm && (
        <div className="empty">
          <Key size={24} opacity={0.3} />
          <p style={{ marginTop: 6, fontSize: 12 }}>未配置 API Key</p>
        </div>
      )}

      {providers.map((p) => {
        const isLoading = modelLoading === p.id
        const isTesting = testing === p.id
        const result = testResult?.id === p.id ? testResult : null
        return (
          <div key={p.id} className="card" style={{ cursor: 'default' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 500 }}>{p.name}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn-ghost btn" onClick={() => handleTest(p.id)} title="测试连通性" disabled={isTesting}>
                  {isTesting ? <Loader size={12} className="spin" /> : <Wifi size={12} />}
                </button>
                <button className="btn-ghost btn" onClick={() => fetchModels(p.id)} title="拉取模型" disabled={isLoading}>
                  {isLoading ? <Loader size={12} className="spin" /> : <RefreshCw size={12} />}
                </button>
                <button className="btn-ghost btn" onClick={() => deleteProvider(p.id)} title="删除">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
            <div style={{ fontSize: 10, opacity: 0.4 }}>{p.baseUrl}</div>

            {/* 测试结果 */}
            {result && (
              <div style={{
                marginTop: 6, padding: '4px 8px', borderRadius: 4, fontSize: 11,
                display: 'flex', alignItems: 'center', gap: 4,
                background: result.success ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                color: result.success ? '#22c55e' : '#ef4444',
              }}>
                {result.success ? <CheckCircle size={12} /> : <XCircle size={12} />}
                {result.message}
              </div>
            )}

            {/* 模型列表 */}
            {p.models && p.models.length > 0 ? (
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {p.models.map((m) => (
                  <span key={m.id} className="badge" style={{ background: 'var(--badge-bg)', fontSize: 9 }}>{m.id}</span>
                ))}
              </div>
            ) : (
              <div style={{ marginTop: 6, fontSize: 10, opacity: 0.3 }}>
                {isLoading ? '拉取中...' : '未拉取模型,点击刷新按钮'}
              </div>
            )}
          </div>
        )
      })}

      {/* Auto-approve 设置 (移植自 Cline) */}
      <div style={{ marginTop: 8, padding: 10, border: '1px solid var(--border)', borderRadius: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 6, opacity: 0.8 }}>自动批准工具</div>
        <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 6 }}>开启后,AI 调用这些工具时无需手动确认</div>
        {[
          { name: 'write_file', label: '写入文件', danger: true },
          { name: 'replace_in_file', label: '差异编辑', danger: true },
          { name: 'execute_command', label: '执行命令', danger: true },
        ].map((tool) => {
          const enabled = useStore.getState().autoApproveTools.includes(tool.name)
          return (
            <label key={tool.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '3px 0', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={useStore.getState().autoApproveTools.includes(tool.name)}
                onChange={() => useStore.getState().toggleAutoApprove(tool.name)}
              />
              <span style={{ color: tool.danger ? '#f59e0b' : 'inherit' }}>{tool.label}</span>
              {tool.danger && <span style={{ fontSize: 9, color: '#ef4444' }}>⚠</span>}
            </label>
          )
        })}
      </div>
    </div>
  )
}
