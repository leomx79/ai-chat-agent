// WebSocket 处理器 - 实时讨论消息推送
import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'
import { subscribe } from './eventBus.js'
import type { WsEvent } from '../../shared/types.js'

let wss: WebSocketServer | null = null

export function initWebSocket(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws: WebSocket) => {
    const unsubMap = new Map<string, () => void>()

    ws.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString())
        // 客户端订阅某个讨论的事件
        if (msg.type === 'subscribe' && msg.discussionId) {
          // 取消旧订阅
          unsubMap.get(msg.discussionId)?.()
          // 建立新订阅
          const unsub = subscribe(msg.discussionId, (event: WsEvent) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(event))
            }
          })
          unsubMap.set(msg.discussionId, unsub)
          ws.send(JSON.stringify({ type: 'subscribed', discussionId: msg.discussionId }))
        }
        if (msg.type === 'unsubscribe' && msg.discussionId) {
          unsubMap.get(msg.discussionId)?.()
          unsubMap.delete(msg.discussionId)
        }
      } catch {
        // 忽略无效消息
      }
    })

    ws.on('close', () => {
      for (const unsub of unsubMap.values()) unsub()
      unsubMap.clear()
    })

    ws.send(JSON.stringify({ type: 'connected' }))
  })

  return wss
}
