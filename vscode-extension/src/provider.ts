// Webview Provider - 管理侧边栏 webview 与扩展宿主的通信
import * as vscode from 'vscode'
import { MessageHandler } from './messageHandler'
import { StateStore } from './store'

export class RoundtableProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView
  private handler: MessageHandler
  public store: StateStore

  constructor(private readonly context: vscode.ExtensionContext) {
    this.store = new StateStore(context)
    this.handler = new MessageHandler(this.store, () => this.view?.webview)
  }

  async resolveWebviewView(view: vscode.WebviewView) {
    this.view = view

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
    }

    view.webview.html = this.getHtml(view.webview)

    view.webview.onDidReceiveMessage(
      (msg) => this.handler.handle(msg),
      undefined,
      this.context.subscriptions,
    )
  }

  postMessage(msg: any) {
    this.view?.webview.postMessage(msg)
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'index.js'),
    )
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'index.css'),
    )
    const nonce = getNonce()

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 img-src ${webview.cspSource} https: data:;
                 style-src ${webview.cspSource} 'unsafe-inline';
                 script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
  }
}

function getNonce(): string {
  let text = ''
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}
