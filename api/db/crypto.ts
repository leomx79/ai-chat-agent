// API Key 加密存储 - AES-256-GCM
import crypto from 'crypto'

// 本地单用户应用,使用固定密钥派生(实际生产环境应使用环境变量)
const SECRET = 'ai-roundtable-discussion-agent-v1'
const KEY = crypto.scryptSync(SECRET, 'roundtable-salt', 32)

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

export function decrypt(encryptedText: string): string {
  try {
    const data = Buffer.from(encryptedText, 'base64')
    const iv = data.subarray(0, 12)
    const tag = data.subarray(12, 28)
    const encrypted = data.subarray(28)
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv)
    decipher.setAuthTag(tag)
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return decrypted.toString('utf8')
  } catch {
    return encryptedText // 解密失败则返回原值(兼容明文)
  }
}
