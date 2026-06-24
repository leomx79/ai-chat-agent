// 项目文件系统操作 - 读写本地项目文件
import fs from 'fs'
import path from 'path'
import type { FileNode, FileChange } from '../../shared/types.js'
import { createDiff } from './diff.js'

const DEFAULT_IGNORE = [
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  '.ai-backup', '.data', '.vscode', '.idea', '*.log',
]

function mergeIgnore(patterns: string[]): string[] {
  return [...new Set([...DEFAULT_IGNORE, ...patterns])]
}

function matchIgnore(name: string, patterns: string[]): boolean {
  for (const p of patterns) {
    if (p === name) return true
    // 简单通配符匹配
    if (p.includes('*')) {
      const regex = new RegExp('^' + p.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$')
      if (regex.test(name)) return true
    }
  }
  return false
}

// 安全校验:确保路径在项目根目录内,防止目录穿越
function safeJoin(root: string, relPath: string): string {
  const resolved = path.resolve(root, relPath)
  const normalizedRoot = path.resolve(root)
  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    throw new Error('路径越权: ' + relPath)
  }
  return resolved
}

export function readTree(rootPath: string, ignorePatterns: string[] = []): FileNode {
  const ignores = mergeIgnore(ignorePatterns)
  const root = path.resolve(rootPath)

  function walk(dir: string, relBase: string): FileNode[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    const nodes: FileNode[] = []
    for (const entry of entries) {
      if (matchIgnore(entry.name, ignores)) continue
      const fullPath = path.join(dir, entry.name)
      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        const children = walk(fullPath, relPath)
        if (children.length > 0) {
          nodes.push({ name: entry.name, path: relPath, type: 'directory', children })
        }
      } else if (entry.isFile()) {
        nodes.push({ name: entry.name, path: relPath, type: 'file' })
      }
    }
    return nodes
  }

  const children = walk(root, '')
  return {
    name: path.basename(root),
    path: '',
    type: 'directory',
    children,
  }
}

export function readFile(rootPath: string, relPath: string): string {
  const fullPath = safeJoin(rootPath, relPath)
  return fs.readFileSync(fullPath, 'utf8')
}

export function writeFile(rootPath: string, relPath: string, content: string): void {
  const fullPath = safeJoin(rootPath, relPath)
  const dir = path.dirname(fullPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(fullPath, content, 'utf8')
}

export function deleteFile(rootPath: string, relPath: string): void {
  const fullPath = safeJoin(rootPath, relPath)
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath)
  }
}

// 写入前备份
function backupFile(rootPath: string, relPath: string): void {
  const fullPath = safeJoin(rootPath, relPath)
  if (!fs.existsSync(fullPath)) return
  const content = fs.readFileSync(fullPath)
  const backupDir = path.join(rootPath, '.ai-backup')
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }
  const backupName = `${relPath.replace(/[\\/]/g, '_')}.${Date.now()}.bak`
  fs.writeFileSync(path.join(backupDir, backupName), content)
}

// 应用修改方案
export function applyChanges(rootPath: string, changes: FileChange[]): { success: boolean; results: string[] } {
  const results: string[] = []
  for (const change of changes) {
    try {
      if (change.action === 'create' || change.action === 'modify') {
        if (change.action === 'modify') {
          backupFile(rootPath, change.filePath)
        }
        writeFile(rootPath, change.filePath, change.content)
        results.push(`✓ ${change.action === 'create' ? '创建' : '修改'}: ${change.filePath}`)
      } else if (change.action === 'delete') {
        backupFile(rootPath, change.filePath)
        deleteFile(rootPath, change.filePath)
        results.push(`✓ 删除: ${change.filePath}`)
      }
    } catch (err) {
      results.push(`✗ 失败: ${change.filePath} - ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return { success: results.every((r) => r.startsWith('✓')), results }
}

// 读取多文件内容(用于构建讨论上下文)
export function readFiles(rootPath: string, relPaths: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const relPath of relPaths) {
    try {
      result[relPath] = readFile(rootPath, relPath)
    } catch {
      result[relPath] = `[无法读取文件: ${relPath}]`
    }
  }
  return result
}

export { createDiff }
