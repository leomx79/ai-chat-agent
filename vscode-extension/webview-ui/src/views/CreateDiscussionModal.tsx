// 创建讨论弹窗
import React, { useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../store'

export function CreateDiscussionModal({ onClose }: { onClose: () => void }) {
  const { participants, createDiscussion, workspace } = useStore()
  const [topic, setTopic] = useState('')
  const [instruction, setInstruction] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [mode, setMode] = useState<'roundtable' | 'chat'>('roundtable')
  const [maxRounds, setMaxRounds] = useState(3)

  const toggle = (id: string) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  const handleCreate = () => {
    if (!topic.trim() || selected.length < 2) return
    createDiscussion({
      topic: topic.trim(),
      context: { filePaths: [], instruction: instruction.trim() },
      participantIds: selected,
      mode,
      maxRounds,
      projectId: workspace?.path || '',
    })
    onClose()
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}>
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px 8px 0 0', padding: 12, width: '100%', maxHeight: '85vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>发起新讨论</span>
          <button className="btn-ghost btn" style={{ padding: '2px 4px' }} onClick={onClose}><X size={14} /></button>
        </div>

        {/* 模式选择 */}
        <div>
          <label className="label">讨论模式</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <button
              style={{ padding: 8, borderRadius: 6, border: `1px solid ${mode === 'roundtable' ? 'var(--accent)' : 'var(--border)'}`, background: mode === 'roundtable' ? 'var(--list-hover)' : 'transparent', cursor: 'pointer', textAlign: 'left' }}
              onClick={() => setMode('roundtable')}
            >
              <div style={{ fontSize: 12, fontWeight: 500 }}>闭门圆桌会议</div>
              <div style={{ fontSize: 10, opacity: 0.5 }}>AI自主熟悉项目,多轮讨论后生成方案</div>
            </button>
            <button
              style={{ padding: 8, borderRadius: 6, border: `1px solid ${mode === 'chat' ? 'var(--accent)' : 'var(--border)'}`, background: mode === 'chat' ? 'var(--list-hover)' : 'transparent', cursor: 'pointer', textAlign: 'left' }}
              onClick={() => setMode('chat')}
            >
              <div style={{ fontSize: 12, fontWeight: 500 }}>自由对话</div>
              <div style={{ fontSize: 10, opacity: 0.5 }}>你与多个AI群聊,随时生成方案</div>
            </button>
          </div>
        </div>

        <div>
          <label className="label">讨论主题</label>
          <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="如:重构用户认证模块" autoFocus />
        </div>

        <div>
          <label className="label">任务说明 (可选)</label>
          <textarea className="input" style={{ minHeight: 50, resize: 'vertical' }} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="具体需求或约束..." />
        </div>

        <div>
          <label className="label">参与AI (至少选择2个,已选 {selected.length})</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {participants.length === 0 && (
              <div style={{ fontSize: 11, opacity: 0.4, padding: 8 }}>请先到 AI 标签页创建参与方</div>
            )}
            {participants.map((p) => (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 4, cursor: 'pointer', background: selected.includes(p.id) ? 'var(--list-hover)' : 'transparent' }}>
                <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} style={{ accentColor: 'var(--accent)' }} />
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />
                <span style={{ fontSize: 12 }}>{p.name}</span>
                <span style={{ fontSize: 10, opacity: 0.4 }}>{p.model}</span>
              </label>
            ))}
          </div>
        </div>

        {mode === 'roundtable' && (
          <div>
            <label className="label">最大讨论轮数</label>
            <select className="input" value={maxRounds} onChange={(e) => setMaxRounds(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} 轮</option>)}
            </select>
          </div>
        )}

        <button className="btn" onClick={handleCreate} disabled={!topic.trim() || selected.length < 2}>
          {mode === 'chat' ? '开始对话' : '开始讨论'}
        </button>
      </div>
    </div>
  )
}
