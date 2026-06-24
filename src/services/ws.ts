// WebSocket 客户端 - 实时讨论消息
import type { WsEvent } from '../../shared/types'

type EventHandler = (event: WsEvent) => void

class WsClient {
  private ws: WebSocket | null = null
  private discussionId: string | null = null
  private handlers: Set<EventHandler> = new Set()
  private reconnectTimer: number | null = null

  connect(discussionId: string) {
    this.disconnect()
    this.discussionId = discussionId

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws`
    this.ws = new WebSocket(wsUrl)

    this.ws.onopen = () => {
      this.ws?.send(JSON.stringify({ type: 'subscribe', discussionId }))
    }

    this.ws.onmessage = (ev) => {
      try {
        const event: WsEvent = JSON.parse(ev.data)
        this.handlers.forEach((fn) => fn(event))
      } catch {
        // 忽略
      }
    }

    this.ws.onclose = () => {
      // 自动重连
      if (this.discussionId) {
        this.reconnectTimer = window.setTimeout(() => {
          if (this.discussionId) this.connect(this.discussionId)
        }, 2000)
      }
    }

    this.ws.onerror = () => {
      this.ws?.close()
    }
  }

  disconnect() {
    this.discussionId = null
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
  }

  on(handler: EventHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }
}

export const wsClient = new WsClient()
