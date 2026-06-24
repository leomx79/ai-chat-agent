// 工具系统 - 让 AI 自主读取/浏览项目文件
// 基于 vscode.workspace.fs 和 Node child_process
import * as vscode from 'vscode'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'

const execAsync = promisify(exec)

const DEFAULT_IGNORE = [
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  '.vscode', '.idea', '.trae', '__pycache__', '.venv',
  '*.log', '*.pyc', '.DS_Store',
]

export interface ToolDefinition {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, any>
    required: string[]
  }
}

// 工具定义列表(发给 LLM)
export const toolDefinitions: ToolDefinition[] = [
  {
    name: 'list_files',
    description: '列出指定目录下的文件和子目录。如果不传 path,则列出工作区根目录。使用 recursive=true 可递归列出(自动忽略 node_modules/.git 等)。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '相对于工作区根目录的路径,留空表示根目录' },
        recursive: { type: 'boolean', description: '是否递归列出子目录,默认 false' },
      },
      required: [],
    },
  },
  {
    name: 'read_file',
    description: '读取指定文件的完整内容。路径相对于工作区根目录。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '相对于工作区根目录的文件路径' },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_files',
    description: '在工作区中搜索匹配 glob 模式的文件,或搜索文件内容(grep)。',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'glob 模式(如 **/*.ts)或搜索关键词' },
        isContentSearch: { type: 'boolean', description: 'true=搜索文件内容, false=搜索文件名(glob), 默认 false' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'write_file',
    description: '写入文件内容。如果文件已存在则覆盖。需要用户确认后才会执行。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '相对于工作区根目录的文件路径' },
        content: { type: 'string', description: '文件完整内容' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'replace_in_file',
    description: '基于 SEARCH/REPLACE 块的差异编辑工具。只需提供要修改的部分,无需重写整个文件。格式:\n```\n<<<<\n旧代码(精确匹配原文)\n====\n新代码\n>>>>\n```\n可包含多个 SEARCH/REPLACE 块。需要用户确认。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '相对于工作区根目录的文件路径' },
        diff: { type: 'string', description: 'SEARCH/REPLACE 块内容,多个块用换行分隔' },
      },
      required: ['path', 'diff'],
    },
  },
  {
    name: 'execute_command',
    description: '在工作区目录执行终端命令并返回输出。需要用户确认后才会执行。',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的命令' },
      },
      required: ['command'],
    },
  },
]

function getWorkspaceRoot(): vscode.Uri | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri
}

function resolvePath(relPath: string): vscode.Uri | undefined {
  const root = getWorkspaceRoot()
  if (!root) return undefined
  if (!relPath) return root
  return vscode.Uri.joinPath(root, relPath)
}

function shouldIgnore(name: string): boolean {
  return DEFAULT_IGNORE.some((p) => {
    if (p === name) return true
    if (p.includes('*')) {
      const regex = new RegExp('^' + p.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$')
      return regex.test(name)
    }
    return false
  })
}

// ============ 工具执行 ============

async function listFiles(args: { path?: string; recursive?: boolean }): Promise<string> {
  const target = resolvePath(args.path || '')
  if (!target) return '错误: 没有打开的工作区'

  try {
    if (args.recursive) {
      const results: string[] = []
      await walkDir(target, '', results, 0)
      return results.length > 0
        ? `目录 ${args.path || '/'} 的文件列表:\n${results.join('\n')}`
        : '目录为空'
    } else {
      const entries = await vscode.workspace.fs.readDirectory(target)
      const filtered = entries.filter(([name]) => !shouldIgnore(name))
      const formatted = filtered
        .map(([name, type]) => `${type === vscode.FileType.Directory ? '📁' : '📄'} ${name}`)
        .sort()
      return `目录 ${args.path || '/'} 内容:\n${formatted.join('\n')}`
    }
  } catch (err) {
    return `错误: ${err instanceof Error ? err.message : String(err)}`
  }
}

async function walkDir(uri: vscode.Uri, relPath: string, results: string[], depth: number) {
  if (depth > 10) return // 防止过深递归
  const entries = await vscode.workspace.fs.readDirectory(uri)
  for (const [name, type] of entries) {
    if (shouldIgnore(name)) continue
    const childPath = relPath ? `${relPath}/${name}` : name
    if (type === vscode.FileType.Directory) {
      results.push(`📁 ${childPath}/`)
      await walkDir(vscode.Uri.joinPath(uri, name), childPath, results, depth + 1)
    } else {
      results.push(`📄 ${childPath}`)
    }
  }
}

async function readFile(args: { path: string }): Promise<string> {
  const uri = resolvePath(args.path)
  if (!uri) return '错误: 没有打开的工作区'

  try {
    const bytes = await vscode.workspace.fs.readFile(uri)
    const content = Buffer.from(bytes).toString('utf8')
    // 截断过长文件
    if (content.length > 30000) {
      return content.slice(0, 30000) + `\n\n... [文件过长,已截断。完整文件共 ${content.length} 字符]`
    }
    return content
  } catch (err) {
    return `错误: 无法读取文件 ${args.path} - ${err instanceof Error ? err.message : String(err)}`
  }
}

async function searchFiles(args: { pattern: string; isContentSearch?: boolean }): Promise<string> {
  const root = getWorkspaceRoot()
  if (!root) return '错误: 没有打开的工作区'

  try {
    if (args.isContentSearch) {
      // 搜索文件内容 - 使用 VS Code 搜索 API
      const results: string[] = []
      const uris = await vscode.workspace.findFiles('**/*', '**/{node_modules,.git,dist,build}/**', 500)
      const pattern_lower = args.pattern.toLowerCase()
      for (const uri of uris.slice(0, 200)) {
        try {
          const bytes = await vscode.workspace.fs.readFile(uri)
          const content = Buffer.from(bytes).toString('utf8')
          const lines = content.split('\n')
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(pattern_lower)) {
              const relPath = vscode.workspace.asRelativePath(uri)
              results.push(`${relPath}:${i + 1}: ${lines[i].trim().slice(0, 200)}`)
              if (results.length >= 50) break
            }
          }
          if (results.length >= 50) break
        } catch {
          // 跳过无法读取的文件
        }
      }
      return results.length > 0
        ? `搜索 "${args.pattern}" 结果 (${results.length} 条):\n${results.join('\n')}`
        : `未找到包含 "${args.pattern}" 的文件`
    } else {
      // glob 搜索文件名
      const exclude = '**/{node_modules,.git,dist,build,.next,.nuxt,__pycache__}/**'
      const uris = await vscode.workspace.findFiles(args.pattern, exclude, 100)
      const paths = uris.map((u) => vscode.workspace.asRelativePath(u))
      return paths.length > 0
        ? `匹配 ${args.pattern} 的文件 (${paths.length} 个):\n${paths.join('\n')}`
        : `未找到匹配 ${args.pattern} 的文件`
    }
  } catch (err) {
    return `搜索失败: ${err instanceof Error ? err.message : String(err)}`
  }
}

async function writeFile(args: { path: string; content: string }): Promise<string> {
  const uri = resolvePath(args.path)
  if (!uri) return '错误: 没有打开的工作区'

  try {
    const content = Buffer.from(args.content, 'utf8')
    await vscode.workspace.fs.writeFile(uri, content)
    return `✓ 文件已写入: ${args.path}`
  } catch (err) {
    return `✗ 写入失败: ${err instanceof Error ? err.message : String(err)}`
  }
}

// SEARCH/REPLACE 块解析与应用 (移植自 Cline)
async function replaceInFile(args: { path: string; diff: string }): Promise<string> {
  const uri = resolvePath(args.path)
  if (!uri) return '错误: 没有打开的工作区'

  try {
    // 读取原文件
    const bytes = await vscode.workspace.fs.readFile(uri)
    const originalContent = Buffer.from(bytes).toString('utf8')

    // 解析 SEARCH/REPLACE 块
    const blocks: { search: string; replace: string }[] = []
    const lines = args.diff.split('\n')
    let i = 0
    while (i < lines.length) {
      if (lines[i].trim() === '<<<<' || lines[i].trim() === '<<<<<<<') {
        const searchLines: string[] = []
        const replaceLines: string[] = []
        i++
        while (i < lines.length && lines[i].trim() !== '====' && lines[i].trim() !== '=======') {
          searchLines.push(lines[i])
          i++
        }
        i++ // skip ==== line
        while (i < lines.length && lines[i].trim() !== '>>>>' && lines[i].trim() !== '>>>>>>>') {
          replaceLines.push(lines[i])
          i++
        }
        i++ // skip >>>> line
        blocks.push({ search: searchLines.join('\n'), replace: replaceLines.join('\n') })
      } else {
        i++
      }
    }

    if (blocks.length === 0) {
      return '✗ 错误: 未找到有效的 SEARCH/REPLACE 块。请使用 <<<< ==== >>>> 格式。'
    }

    // 逐块应用替换
    let modifiedContent = originalContent
    for (const block of blocks) {
      const searchStr = block.search
      const replaceStr = block.replace
      if (!modifiedContent.includes(searchStr)) {
        return `✗ 错误: 未找到匹配的代码块。\n搜索内容:\n${searchStr.slice(0, 200)}\n\n请确保 SEARCH 部分与原文完全一致(包括空格和缩进)。`
      }
      // 只替换第一个匹配
      modifiedContent = modifiedContent.replace(searchStr, replaceStr)
    }

    // 写入修改后的文件
    const content = Buffer.from(modifiedContent, 'utf8')
    await vscode.workspace.fs.writeFile(uri, content)
    return `✓ 文件已修改: ${args.path} (${blocks.length} 处替换)`
  } catch (err) {
    return `✗ 修改失败: ${err instanceof Error ? err.message : String(err)}`
  }
}

async function executeCommand(args: { command: string }): Promise<string> {
  const root = getWorkspaceRoot()
  if (!root) return '错误: 没有打开的工作区'
  const cwd = root.fsPath

  try {
    const { stdout, stderr } = await execAsync(args.command, {
      cwd,
      timeout: 60000,
      maxBuffer: 1024 * 1024 * 5,
    })
    let result = ''
    if (stdout) result += stdout
    if (stderr) result += `\n[stderr]: ${stderr}`
    if (!result) result = '(命令执行完成,无输出)'
    return result.slice(0, 30000)
  } catch (err: any) {
    const output = (err.stdout || '') + (err.stderr || '')
    return `命令退出码 ${err.code || 1}:\n${output || err.message}`.slice(0, 30000)
  }
}

// ============ 统一执行入口 ============

export async function executeTool(name: string, args: any): Promise<string> {
  switch (name) {
    case 'list_files':
      return listFiles(args)
    case 'read_file':
      return readFile(args)
    case 'search_files':
      return searchFiles(args)
    case 'write_file':
      return writeFile(args)
    case 'replace_in_file':
      return replaceInFile(args)
    case 'execute_command':
      return executeCommand(args)
    default:
      return `未知工具: ${name}`
  }
}

// 判断是否为危险工具(需要用户确认)
export function isDangerousTool(name: string): boolean {
  return name === 'write_file' || name === 'replace_in_file' || name === 'execute_command'
}
