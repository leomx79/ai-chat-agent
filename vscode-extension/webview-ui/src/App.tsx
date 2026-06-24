// 主应用组件
import React, { useEffect, useState } from 'react'
import { MessageSquare, Users, Settings, Plus, ArrowLeft, Send, Sparkles, StopCircle, Check, X, Loader, FileCode, Wrench } from 'lucide-react'
import { useStore } from './store'
import { DiscussionList } from './views/DiscussionList'
import { DiscussionDetail } from './views/DiscussionDetail'
import { ProviderList } from './views/ProviderList'
import { ParticipantList } from './views/ParticipantList'
import { CreateDiscussionModal } from './views/CreateDiscussionModal'

export default function App() {
  const { view, init, workspace } = useStore()
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => { init() }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* 顶部导航 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <NavBtn icon={MessageSquare} label="讨论" active={view === 'discussions' || view === 'detail'} onClick={() => useStore.getState().setView('discussions')} />
        <NavBtn icon={Users} label="AI" active={view === 'participants'} onClick={() => useStore.getState().setView('participants')} />
        <NavBtn icon={Settings} label="API" active={view === 'providers'} onClick={() => useStore.getState().setView('providers')} />
        <div style={{ flex: 1 }} />
        {view === 'discussions' && (
          <button className="btn" onClick={() => setShowCreate(true)} title="发起新讨论" style={{ padding: '3px 6px' }}>
            <Plus size={14} />
          </button>
        )}
      </div>

      {/* 工作区信息 */}
      {workspace && (
        <div style={{ padding: '4px 10px', fontSize: 10, opacity: 0.5, borderBottom: '1px solid var(--border)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <FileCode size={10} style={{ display: 'inline', marginRight: 3 }} />
          {workspace.name}
        </div>
      )}

      {/* 内容区 */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {view === 'discussions' && <DiscussionList />}
        {view === 'detail' && <DiscussionDetail />}
        {view === 'providers' && <ProviderList />}
        {view === 'participants' && <ParticipantList />}
      </div>

      {showCreate && <CreateDiscussionModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}

function NavBtn({ icon: Icon, label, active, onClick }: { icon: any; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '3px 8px', borderRadius: 4, fontSize: 11,
        background: active ? 'var(--list-hover)' : 'transparent',
        border: 'none', color: 'var(--fg)', cursor: 'pointer',
      }}
    >
      <Icon size={13} />
      {label}
    </button>
  )
}
