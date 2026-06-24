// Diff 生成工具
import { diffLines } from 'diff'

export function createDiff(original: string, modified: string, filePath = ''): string {
  const parts = diffLines(original, modified)
  let result = ''
  if (filePath) result += `--- a/${filePath}\n+++ b/${filePath}\n`
  for (const part of parts) {
    const prefix = part.added ? '+' : part.removed ? '-' : ' '
    const lines = part.value.split('\n')
    // 去掉末尾空行
    if (lines[lines.length - 1] === '') lines.pop()
    for (const line of lines) {
      result += prefix + line + '\n'
    }
  }
  return result
}
