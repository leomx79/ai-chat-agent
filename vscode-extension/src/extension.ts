// VS Code 扩展入口
import * as vscode from 'vscode'
import { RoundtableProvider } from './provider'

export function activate(context: vscode.ExtensionContext) {
  const provider = new RoundtableProvider(context)

  // 注册侧边栏 webview view provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('aiRoundtableView', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  )

  // 命令: 打开面板
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-roundtable.openPanel', () => {
      vscode.commands.executeCommand('aiRoundtableView.focus')
    }),
  )

  // 命令: 发起新讨论
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-roundtable.newDiscussion', () => {
      provider.postMessage({ type: 'newDiscussion' })
    }),
  )
}

export function deactivate() {}
