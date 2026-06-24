// VS Code API 桥接 - 替代 fetch/WebSocket, 使用 postMessage
declare function acquireVsCodeApi(): any

let vscodeApi: any
export function getVsCodeApi() {
  if (!vscodeApi) vscodeApi = acquireVsCodeApi()
  return vscodeApi
}

export function postMessage(msg: any) {
  getVsCodeApi().postMessage(msg)
}

export function onMessage(handler: (msg: any) => void) {
  const listener = (e: MessageEvent) => handler(e.data)
  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}
