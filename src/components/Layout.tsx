import { NavLink, useLocation } from 'react-router-dom'
import {
  Server,
  Users,
  FolderGit2,
  MessagesSquare,
  History,
  Orbit,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/providers', label: 'API 提供商', icon: Server, desc: '管理 API 接入' },
  { to: '/participants', label: 'AI 参与方', icon: Users, desc: '配置 AI 角色' },
  { to: '/projects', label: '项目', icon: FolderGit2, desc: '管理本地项目' },
  { to: '/discussions', label: '圆桌讨论', icon: MessagesSquare, desc: '发起 AI 讨论' },
  { to: '/history', label: '历史记录', icon: History, desc: '查看过往讨论' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-ink-950 bg-grid">
      {/* 侧边栏 */}
      <aside className="flex w-64 flex-col border-r border-white/5 bg-ink-900/80 backdrop-blur-xl">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/5">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-purple-600 shadow-lg shadow-accent/20">
            <Orbit className="h-5 w-5 text-white" />
            <div className="absolute inset-0 rounded-xl ring-1 ring-white/20" />
          </div>
          <div>
            <h1 className="font-display text-base font-bold text-white leading-tight">
              圆桌智囊
            </h1>
            <p className="text-[10px] text-zinc-500 font-mono tracking-wide">
              AI ROUNDTABLE
            </p>
          </div>
        </div>

        {/* 导航 */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active =
              location.pathname === item.to ||
              (item.to === '/discussions' && location.pathname.startsWith('/discussions'))
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200',
                  active
                    ? 'bg-accent/10 text-white border border-accent/20'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent',
                )}
              >
                <Icon
                  className={cn(
                    'h-4.5 w-4.5 transition-colors',
                    active ? 'text-accent-light' : 'text-zinc-500 group-hover:text-zinc-300',
                  )}
                  size={18}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-[10px] text-zinc-600 truncate">{item.desc}</div>
                </div>
                {active && (
                  <div className="h-1.5 w-1.5 rounded-full bg-accent-light animate-pulse-soft" />
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* 底部状态 */}
        <div className="px-5 py-4 border-t border-white/5">
          <div className="flex items-center gap-2 text-[10px] text-zinc-600 font-mono">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>LOCAL · v1.0</span>
          </div>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
