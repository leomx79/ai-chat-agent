// 提供商管理 - DeepSeek API Key 配置
import React, { useState } from 'react'
import { Plus, Trash2, RefreshCw, Key, Loader, Wifi, CheckCircle, XCircle } from 'lucide-react'
import { useStore } from '../store'

export function ProviderList() {
  const { providers, saveProvider, deleteProvider, fetchModels, testProvider, modelLoading, testResult } = useStore()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [testing, setTesting] = useState<string | null>(null)

  const handleSave = () => {
    if (!apiKey.trim()) return
    saveProvider({
      name: name.trim() || 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: apiKey.trim(),
      protocol: 'openai',
      type: 'official',
    })
    setName('')
    setApiKey('')
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
        <span style={{ fontSize: 11, opacity: 0.7 }}>DeepSeek API</span>
        <button className="btn" onClick={() => setShowForm(!showForm)} style={{ padding: '2px 6px' }}>
          <Plus size={12} />
        </button>
      </div>

      {showForm && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, border: '1px solid var(--border)', borderRadius: 6 }}>
          <div>
            <label className="label">名称(可选)</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="DeepSeek" />
          </div>
          <div>
            <label className="label">API Key</label>
            <input className="input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
          </div>
          <button className="btn" onClick={handleSave} disabled={!apiKey.trim()}>保存</button>
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
    </div>
  )
}
