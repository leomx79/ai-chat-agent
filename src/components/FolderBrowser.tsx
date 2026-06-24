// 本地目录浏览器组件 - 类似 IDE 的文件夹选择器
import { useEffect, useState, useCallback } from 'react'
import { Folder, ChevronRight, HardDrive, ArrowUp, CheckCircle2, Loader2 } from 'lucide-react'
import { api } from '@/services/api'
import { cn } from '@/lib/utils'

interface DirEntry {
  name: string
  path: string
  type: 'directory'
}

interface BrowseResult {
  current: string
  parent: string | null
  dirs: DirEntry[]
  isGitRepo: boolean
}

export default function FolderBrowser({
  onSelect,
  selected,
}: {
  onSelect: (path: string) => void
  selected: string
}) {
  const [data, setData] = useState<BrowseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const browse = useCallback(async (dir?: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.browseDir(dir)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '浏览失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    browse()
  }, [browse])

  return (
    <div className="flex flex-col rounded-xl border border-white/5 bg-ink-950/50 overflow-hidden">
      {/* 导航栏 */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/5 bg-ink-900/50">
        <button
          onClick={() => browse()}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
          title="所有盘符"
        >
          <HardDrive size={14} />
        </button>
        <button
          onClick={() => data?.parent && browse(data.parent)}
          disabled={!data?.parent}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="上级目录"
        >
          <ArrowUp size={14} />
        </button>
        <div className="flex-1 min-w-0 px-2 text-xs font-mono text-zinc-400 truncate">
          {data?.current === 'roots' ? '所有盘符' : data?.current || '加载中...'}
        </div>
        {data?.isGitRepo && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Git 仓库
          </span>
        )}
      </div>

      {/* 目录列表 */}
      <div className="max-h-64 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-zinc-500">
            <Loader2 size={16} className="animate-spin mr-2" />
            加载中...
          </div>
        ) : error ? (
          <div className="px-4 py-8 text-center text-xs text-red-400">{error}</div>
        ) : data && data.dirs.length > 0 ? (
          <div className="py-1">
            {data.dirs.map((d) => {
              const isSelected = selected === d.path
              const isRootView = data.current === 'roots'
              return (
                <button
                  key={d.path}
                  onClick={() => onSelect(d.path)}
                  onDoubleClick={() => browse(d.path)}
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-1.5 text-sm transition-colors text-left',
                    isSelected
                      ? 'bg-accent/15 text-accent-light'
                      : 'text-zinc-300 hover:bg-white/5',
                  )}
                >
                  {isSelected ? (
                    <CheckCircle2 size={14} className="shrink-0 text-accent-light" />
                  ) : isRootView ? (
                    <HardDrive size={14} className="shrink-0 text-blue-400/70" />
                  ) : (
                    <Folder size={14} className="shrink-0 text-amber-400/70" />
                  )}
                  <span className="truncate flex-1">{d.name}</span>
                  <ChevronRight size={12} className="shrink-0 text-zinc-600" />
                </button>
              )
            })}
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-xs text-zinc-600">此目录下没有子目录</div>
        )}
      </div>

      {/* 底部操作 */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-white/5 bg-ink-900/50">
        <span className="text-[10px] text-zinc-600">
          单击选择 · 双击进入目录
        </span>
        {selected && (
          <span className="text-[10px] text-accent-light font-mono truncate max-w-[200px]">
            已选: {selected}
          </span>
        )}
      </div>
    </div>
  )
}
