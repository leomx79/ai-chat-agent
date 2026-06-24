// 讨论事件总线 - 引擎与 WebSocket 之间的通信桥梁
import type { WsEvent } from '../../shared/types.js'

type Listener = (event: WsEvent) => void

const listeners = new Map<string, Set<Listener>>()

export function subscribe(discussionId: string, fn: Listener): () => void {
  if (!listeners.has(discussionId)) {
    listeners.set(discussionId, new Set())
  }
  listeners.get(discussionId)!.add(fn)
  return () => {
    listeners.get(discussionId)?.delete(fn)
  }
}

export function emit(event: WsEvent): void {
  const set = listeners.get(event.discussionId)
  if (set) {
    for (const fn of set) fn(event)
  }
}

// 广播给所有监听该讨论的连接
export function broadcast(discussionId: string, type: WsEvent['type'], data?: any): void {
  emit({ type, discussionId, data })
}
