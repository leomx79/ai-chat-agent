// Project 路由 - 项目管理 + 文件系统
import { Router, type Request, type Response } from 'express'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import { projectStore } from '../db/store.js'
import { readTree, readFile } from '../fs/projectFs.js'

const execAsync = promisify(exec)

const router = Router()

// 浏览本地目录 - 返回指定路径下的子目录列表(类似 IDE 文件夹选择器)
router.get('/browse', (req: Request, res: Response) => {
  const dir = (req.query.dir as string) || ''

  // Windows: 列出所有盘符根目录作为起始点
  function getWindowsDrives(): string[] {
    const drives: string[] = []
    for (let code = 65; code <= 90; code++) {
      const letter = String.fromCharCode(code)
      const drivePath = `${letter}:\\`
      try {
        if (fs.existsSync(drivePath) && fs.statSync(drivePath).isDirectory()) {
          drives.push(drivePath)
        }
      } catch {
        // 盘符不可访问,跳过
      }
    }
    return drives
  }

  // 根级视图: Windows 列出所有盘符, Unix 返回根目录
  if (!dir || dir === 'roots') {
    const isWindows = process.platform === 'win32'
    if (isWindows) {
      const drives = getWindowsDrives()
      const dirs = drives.map((d) => ({
        name: d,
        path: d,
        type: 'directory' as const,
      }))
      res.json({
        success: true,
        data: {
          current: 'roots',
          parent: null,
          dirs,
          isGitRepo: false,
        },
      })
      return
    }
    // Unix: 从根目录开始
    dir || '/'
  }

  let target: string
  if (!dir || dir === 'roots') {
    target = os.homedir()
  } else {
    target = path.resolve(dir)
  }

  try {
    if (!fs.existsSync(target)) {
      res.status(400).json({ success: false, error: '路径不存在' })
      return
    }
    const stat = fs.statSync(target)
    if (!stat.isDirectory()) {
      res.status(400).json({ success: false, error: '不是目录' })
      return
    }

    const entries = fs.readdirSync(target, { withFileTypes: true })
    const dirs = entries
      .filter((e) => e.isDirectory())
      .filter((e) => !e.name.startsWith('.') || e.name === '..')
      .map((e) => ({
        name: e.name,
        path: path.join(target, e.name),
        type: 'directory' as const,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    // 检查是否为 git 仓库
    const isGitRepo = fs.existsSync(path.join(target, '.git'))

    // 判断是否为盘符根目录(如 C:\),此时没有上级
    const isDriveRoot = /^[A-Za-z]:[\\/]$/.test(target)
    const parent = isDriveRoot ? null : path.dirname(target) !== target ? path.dirname(target) : null

    res.json({
      success: true,
      data: {
        current: target,
        parent,
        dirs,
        isGitRepo,
      },
    })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : '浏览目录失败',
    })
  }
})

// Git 克隆
router.post('/clone', async (req: Request, res: Response) => {
  const { url, destDir, name } = req.body
  if (!url || !destDir) {
    res.status(400).json({ success: false, error: '缺少仓库地址或目标目录' })
    return
  }

  const repoName = name || url.replace(/\.git$/, '').split('/').pop() || 'cloned-repo'
  const destPath = path.resolve(destDir, repoName)

  if (fs.existsSync(destPath)) {
    res.status(400).json({ success: false, error: `目标目录已存在: ${destPath}` })
    return
  }

  try {
    // 执行 git clone，设置超时 120 秒
    await execAsync(`git clone --depth 1 "${url}" "${destPath}"`, {
      timeout: 120000,
      maxBuffer: 1024 * 1024 * 10,
    })

    // 确认克隆成功
    if (!fs.existsSync(destPath)) {
      res.status(500).json({ success: false, error: '克隆失败: 目标目录未创建' })
      return
    }

    res.json({
      success: true,
      data: { path: destPath, name: repoName },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Git 克隆失败'
    // 清理不完整的克隆
    try {
      if (fs.existsSync(destPath)) {
        fs.rmSync(destPath, { recursive: true, force: true })
      }
    } catch {
      // 忽略清理错误
    }
    res.status(500).json({ success: false, error: message })
  }
})

// 检测 git 是否可用
router.get('/git-status', (_req: Request, res: Response) => {
  exec('git --version', (err, stdout) => {
    if (err) {
      res.json({ success: true, data: { available: false, version: null } })
      return
    }
    res.json({ success: true, data: { available: true, version: stdout.trim() } })
  })
})

router.get('/', (_req: Request, res: Response) => {
  const list = projectStore.list()
  res.json({ success: true, data: list })
})

router.get('/:id', (req: Request, res: Response) => {
  const item = projectStore.get(req.params.id)
  if (!item) {
    res.status(404).json({ success: false, error: '未找到项目' })
    return
  }
  res.json({ success: true, data: item })
})

router.post('/', (req: Request, res: Response) => {
  const { name, path: projectPath, ignorePatterns } = req.body
  if (!name || !projectPath) {
    res.status(400).json({ success: false, error: '缺少必填字段(名称、路径)' })
    return
  }
  if (!fs.existsSync(projectPath)) {
    res.status(400).json({ success: false, error: '项目路径不存在' })
    return
  }
  const item = projectStore.create({
    name,
    path: path.resolve(projectPath),
    ignorePatterns: ignorePatterns || [],
  })
  res.json({ success: true, data: item })
})

router.put('/:id', (req: Request, res: Response) => {
  const item = projectStore.update(req.params.id, req.body)
  if (!item) {
    res.status(404).json({ success: false, error: '未找到项目' })
    return
  }
  res.json({ success: true, data: item })
})

router.delete('/:id', (req: Request, res: Response) => {
  const ok = projectStore.remove(req.params.id)
  res.json({ success: ok })
})

// 文件树
router.get('/:id/tree', (req: Request, res: Response) => {
  const project = projectStore.get(req.params.id)
  if (!project) {
    res.status(404).json({ success: false, error: '未找到项目' })
    return
  }
  try {
    const tree = readTree(project.path, project.ignorePatterns)
    res.json({ success: true, data: tree })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : '读取文件树失败',
    })
  }
})

// 读文件内容
router.get('/:id/file', (req: Request, res: Response) => {
  const project = projectStore.get(req.params.id)
  if (!project) {
    res.status(404).json({ success: false, error: '未找到项目' })
    return
  }
  const filePath = req.query.path as string
  if (!filePath) {
    res.status(400).json({ success: false, error: '缺少 path 参数' })
    return
  }
  try {
    const content = readFile(project.path, filePath)
    res.json({ success: true, data: content })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : '读取文件失败',
    })
  }
})

export default router
