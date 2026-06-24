// 讨论列表视图
import React from 'react'
import { MessageSquare, Users, Clock } from 'lucide-react'
import { useStore } from '../store'

const statusLabels: Record<string, { text: string; color: string }> = {
  discussing: { text: '讨论中', color: '#fbbf24' },
  consensus: { text: '已共识', color: '#34d399' },
  proposing: { text: '生成方案', color: '#60a5fa' },
  reviewing: { text: '待审查', color: '#a78bfa' },
  executing: { text: '执行中', color: '#f97316' },
  done: { text: '已完成', color: '#22c55e' },
  rejected: { text: '已终止', color: '#6b7280' },
}

export function DiscussionList() {
  const { discussions, participants, openDiscussion } = useStore()

  if (discussions.length === 0) {
    return (
      <div className="empty">
        <MessageSquare size={28} opacity={0.3} />
        <p style={{ marginTop: 8, fontSize: 12 }}>暂无讨论</p>
        <p style={{ fontSize: 11, opacity: 0.5 }}>点击右上角 + 发起新讨论</p>
      </div>
    )
  }

  return (
    <div style={{ overflow: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {discussions.map((d) => {
        const si = statusLabels[d.status] || { text: d.status, color: '#999' }
        const parts = d.participantIds.length
        return (
          <div key={d.id} className="card" onClick={() => openDiscussion(d.id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span className="badge" style={{ background: si.color + '22', color: si.color }}>{si.text}</span>
              {d.mode === 'chat' && (
                <span className="badge" style={{ background: '#3b82f622', color: '#60a5fa' }}>自由对话</span>
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, opacity: 0.5 }}>
                <Users size={10} /> {parts}
              </span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.topic}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, opacity: 0.4, marginTop: 3 }}>
              <Clock size={9} />
              {new Date(d.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
