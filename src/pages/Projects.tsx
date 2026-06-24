import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FolderGit2,
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  GitBranch,
  HardDrive,
  Loader2,
} from 'lucide-react'
import { Modal, Button, Input, Badge, EmptyState } from '@/components/ui'
import FolderBrowser from '@/components/FolderBrowser'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/stores/project'
import { api } from '@/services/api'
import type { Project, FileNode } from '../../shared/types'

// ============ 递归文件树节点 ============
function FileTreeNode({
  node,
  depth,
  selectedFile,
  onSelect,
  expanded,
  onToggle,
}: {
  node: FileNode
  depth: number
  selectedFile: string | null
  onSelect: (path: string) => void
  expanded: Set<string>
  onToggle: (path: string) => void
}) {
  const isDir = node.type === 'directory'
  const isOpen = expanded.has(node.path)
  const isSelected = selectedFile === node.path
  return (
    <div>
      <button
        onClick={() => (isDir ? onToggle(node.path) : onSelect(node.path))}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors',
          isSelected ? 'bg-accent/15 text-accent-light' : 'text-zinc-300 hover:bg-white/5',
        )}
        style={{ paddingLeft: depth * 12 + 8 }}
      >
        {isDir ? (
          isOpen ? (
            <ChevronDown size={14} className="shrink-0 text-zinc-500" />
          ) : (
            <ChevronRight size={14} className="shrink-0 text-zinc-500" />
          )
        ) : (
          <span className="w-[14px] shrink-0" />
        )}
        {isDir ? (
          isOpen ? (
            <FolderOpen size={15} className="shrink-0 text-amber-400/80" />
          ) : (
            <Folder size={15} className="shrink-0 text-amber-400/80" />
          )
        ) : (
          <FileCode size={15} className="shrink-0 text-zinc-500" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {isDir &&
        isOpen &&
        node.children?.map((child) => (
          <FileTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedFile={selectedFile}
            onSelect={onSelect}
            expanded={expanded}
            onToggle={onToggle}
          />
        ))}
    </div>
  )
}

function countFiles(node: FileNode | null): number {
  if (!node) return 0
  if (node.type === 'file') return 1
  return (node.children ?? []).reduce((acc, c) => acc + countFiles(c), 0)
}

// ============ 项目管理页 ============
export default function Projects() {
  const navigate = useNavigate()
  const {
    projects,
    currentProject,
    tree,
    fileContent,
    selectedFile,
    fetchAll,
    create,
    remove,
    selectProject,
    fetchTree,
    readFile,
  } = useProjectStore()

  const [modalOpen, setModalOpen] = useState(false)
  const [tab, setTab] = useState<'browse' | 'git' | 'manual'>('browse')
  const [browsePath, setBrowsePath] = useState('')
  const [gitForm, setGitForm] = useState({ url: '', destDir: '', name: '' })
  const [manualForm, setManualForm] = useState({ name: '', path: '', ignorePatterns: '' })
  const [gitAvailable, setGitAvailable] = useState<boolean | null>(null)
  const [cloning, setCloning] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // 检测 git 是否可用
  useEffect(() => {
    if (modalOpen && gitAvailable === null) {
      api.gitStatus().then((r) => setGitAvailable(r.available)).catch(() => setGitAvailable(false))
    }
  }, [modalOpen, gitAvailable])

  const handleSelect = async (p: Project) => {
    selectProject(p)
    setExpanded(new Set())
    await fetchTree(p.id)
    const t = useProjectStore.getState().tree
    if (t?.children) {
      setExpanded(new Set(t.children.filter((c) => c.type === 'directory').map((c) => c.path)))
    }
  }

  const handleAddBrowse = async () => {
    if (!browsePath) return
    setSubmitting(true)
    try {
      const name = browsePath.split(/[\\/]/).pop() || 'project'
      const item = await create({ name, path: browsePath, ignorePatterns: [] })
      setModalOpen(false)
      setBrowsePath('')
      handleSelect(item)
    } finally {
      setSubmitting(false)
    }
  }

  const handleGitClone = async () => {
    if (!gitForm.url.trim() || !gitForm.destDir.trim()) return
    setCloning(true)
    try {
      const result = await api.gitClone({
        url: gitForm.url.trim(),
        destDir: gitForm.destDir.trim(),
        name: gitForm.name.trim() || undefined,
      })
      const item = await create({
        name: result.name,
        path: result.path,
        ignorePatterns: [],
      })
      setModalOpen(false)
      setGitForm({ url: '', destDir: '', name: '' })
      handleSelect(item)
    } catch (err) {
      alert(err instanceof Error ? err.message : '克隆失败')
    } finally {
      setCloning(false)
    }
  }

  const handleAddManual = async () => {
    if (!manualForm.name.trim() || !manualForm.path.trim()) return
    setSubmitting(true)
    try {
      const item = await create({
        name: manualForm.name.trim(),
        path: manualForm.path.trim(),
        ignorePatterns: manualForm.ignorePatterns
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      })
      setModalOpen(false)
      setManualForm({ name: '', path: '', ignorePatterns: '' })
      handleSelect(item)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!currentProject) return
    const id = currentProject.id
    await remove(id)
    if (useProjectStore.getState().currentProject?.id === id) {
      useProjectStore.setState({ currentProject: null, tree: null, selectedFile: null, fileContent: '' })
    }
  }

  const handleToggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const handleStartDiscussion = () => {
    if (!currentProject) return
    navigate('/discussions', {
      state: { projectId: currentProject.id, projectName: currentProject.name },
    })
  }

  const fileCount = useMemo(() => countFiles(tree), [tree])
  const lines = useMemo(() => fileContent.split('\n'), [fileContent])

  return (
    <div className="flex h-full">
      {/* 左侧 - 项目列表 */}
      <aside className="flex w-80 flex-col border-r border-white/5 bg-ink-900/40">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <FolderGit2 size={18} className="text-accent-light" />
            <h1 className="font-display text-lg font-bold text-white">项目</h1>
          </div>
          <Button size="sm" variant="primary" onClick={() => setModalOpen(true)}>
            <Plus size={14} /> 添加项目
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FolderGit2 size={28} className="text-zinc-700" />
              <p className="mt-3 text-xs text-zinc-600">暂无项目，点击「添加项目」</p>
            </div>
          ) : (
            projects.map((p) => {
              const active = currentProject?.id === p.id
              return (
                <button
                  key={p.id}
                  onClick={() => handleSelect(p)}
                  className={cn(
                    'glass glass-hover w-full rounded-xl p-3 text-left transition-all duration-200',
                    active ? 'ring-2 ring-accent/30 border-accent/40' : 'border-transparent',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-white">{p.name}</span>
                    {active && tree ? (
                      <Badge color="indigo">{fileCount} 文件</Badge>
                    ) : (
                      <Badge>
                        <Folder size={10} /> 本地
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 truncate text-[11px] font-mono text-zinc-600">{p.path}</p>
                </button>
              )
            })
          )}
        </div>
      </aside>

      {/* 右侧 - 项目详情 */}
      <section className="flex flex-1 flex-col overflow-hidden">
        {!currentProject ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={FolderGit2}
              title="未选择项目"
              desc="从左侧选择一个项目，或创建新项目以浏览文件并发起 AI 圆桌讨论"
            />
          </div>
        ) : (
          <>
            {/* 项目信息栏 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-base font-semibold text-white">{currentProject.name}</h2>
                  <Badge color="indigo">{fileCount} 文件</Badge>
                </div>
                <p className="mt-0.5 truncate text-[11px] font-mono text-zinc-600">{currentProject.path}</p>
              </div>
              <Button variant="danger" size="sm" onClick={handleDelete}>
                <Trash2 size={14} /> 删除
              </Button>
            </div>

            {/* 文件树 + 文件内容 */}
            <div className="flex flex-1 overflow-hidden">
              <div className="w-72 shrink-0 overflow-y-auto border-r border-white/5 bg-ink-950/30 p-2">
                {tree?.children?.length ? (
                  tree.children.map((node) => (
                    <FileTreeNode
                      key={node.path}
                      node={node}
                      depth={0}
                      selectedFile={selectedFile}
                      onSelect={(path) => currentProject && readFile(currentProject.id, path)}
                      expanded={expanded}
                      onToggle={handleToggle}
                    />
                  ))
                ) : (
                  <p className="px-2 py-6 text-center text-xs text-zinc-600">加载中...</p>
                )}
              </div>
              <div className="flex-1 overflow-auto bg-ink-950/40">
                {selectedFile ? (
                  <div className="flex h-full">
                    <div className="select-none border-r border-white/5 px-3 py-3 text-right font-mono text-xs leading-6 text-zinc-700">
                      {lines.map((_, i) => (
                        <div key={i}>{i + 1}</div>
                      ))}
                    </div>
                    <pre className="flex-1 overflow-auto px-4 py-3 font-mono text-xs leading-6 text-zinc-300 whitespace-pre">
                      {fileContent}
                    </pre>
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <FileText size={28} className="text-zinc-700" />
                    <p className="mt-3 text-xs text-zinc-600">从左侧文件树选择文件以查看内容</p>
                  </div>
                )}
              </div>
            </div>

            {/* 底部操作 */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-white/5 bg-ink-900/40">
              <p className="text-[11px] text-zinc-600">基于当前项目发起 AI 多方讨论，自动注入文件上下文</p>
              <Button variant="primary" onClick={handleStartDiscussion}>
                发起讨论
              </Button>
            </div>
          </>
        )}
      </section>

      {/* 添加项目弹窗 */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="添加项目"
        width="max-w-2xl"
      >
        <div className="space-y-4">
          {/* 方式选择 Tab */}
          <div className="flex gap-1.5 p-1 bg-ink-850 rounded-xl border border-white/5">
            {[
              { key: 'browse' as const, label: '本地浏览', icon: HardDrive },
              { key: 'git' as const, label: 'Git 克隆', icon: GitBranch },
              { key: 'manual' as const, label: '手动输入', icon: Plus },
            ].map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all flex-1 justify-center',
                    tab === t.key
                      ? 'bg-accent text-white shadow-lg shadow-accent/20'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5',
                  )}
                >
                  <Icon size={13} />
                  {t.label}
                </button>
              )
            })}
          </div>

          {/* 本地浏览 */}
          {tab === 'browse' && (
            <div className="space-y-3">
              <p className="text-xs text-zinc-500">
                浏览本地文件系统,选择项目所在目录。单击选择,双击进入目录。
              </p>
              <FolderBrowser onSelect={setBrowsePath} selected={browsePath} />
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={() => setModalOpen(false)}>
                  取消
                </Button>
                <Button
                  variant="primary"
                  onClick={handleAddBrowse}
                  disabled={submitting || !browsePath}
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
                  选择此目录
                </Button>
              </div>
            </div>
          )}

          {/* Git 克隆 */}
          {tab === 'git' && (
            <div className="space-y-3">
              {gitAvailable === false ? (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-xs text-amber-400">
                  未检测到 Git,请先安装 Git 后重试。
                </div>
              ) : (
                <>
                  <p className="text-xs text-zinc-500">
                    克隆远程仓库到本地,使用 <code className="text-accent-light">--depth 1</code> 浅克隆加速。
                  </p>
                  <Input
                    label="仓库地址"
                    placeholder="https://github.com/user/repo.git"
                    value={gitForm.url}
                    onChange={(e) => setGitForm({ ...gitForm, url: e.target.value })}
                  />
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                      克隆到目录
                    </label>
                    <FolderBrowser
                      onSelect={(p) => setGitForm({ ...gitForm, destDir: p })}
                      selected={gitForm.destDir}
                    />
                  </div>
                  <Input
                    label="项目名称（可选，默认使用仓库名）"
                    placeholder="如：my-project"
                    value={gitForm.name}
                    onChange={(e) => setGitForm({ ...gitForm, name: e.target.value })}
                  />
                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="ghost" onClick={() => setModalOpen(false)}>
                      取消
                    </Button>
                    <Button
                      variant="primary"
                      onClick={handleGitClone}
                      disabled={cloning || !gitForm.url.trim() || !gitForm.destDir.trim()}
                    >
                      {cloning ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} />}
                      {cloning ? '克隆中...' : '克隆并添加'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 手动输入 */}
          {tab === 'manual' && (
            <div className="space-y-3">
              <p className="text-xs text-zinc-500">手动输入项目名称和本地路径。</p>
              <Input
                label="项目名称"
                placeholder="如：my-awesome-app"
                value={manualForm.name}
                onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
              />
              <Input
                label="本地路径"
                placeholder="如：/Users/you/projects/my-app"
                value={manualForm.path}
                onChange={(e) => setManualForm({ ...manualForm, path: e.target.value })}
              />
              <Input
                label="忽略规则（逗号分隔）"
                placeholder="如：node_modules, .git, dist"
                value={manualForm.ignorePatterns}
                onChange={(e) => setManualForm({ ...manualForm, ignorePatterns: e.target.value })}
              />
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={() => setModalOpen(false)}>
                  取消
                </Button>
                <Button
                  variant="primary"
                  onClick={handleAddManual}
                  disabled={submitting || !manualForm.name.trim() || !manualForm.path.trim()}
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
                  创建
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
