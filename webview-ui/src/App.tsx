import { useEffect } from "react"
import ChatView from "./components/chat/ChatView"
import HistoryView from "./components/history/HistoryView"
import SettingsView from "./components/settings/SettingsView"
import WelcomeView from "./components/welcome/WelcomeView"
import AccountView from "./components/account/AccountView"
import { useExtensionState } from "./context/ExtensionStateContext"
import { UiServiceClient } from "./services/grpc-client"
import McpView from "./components/mcp/configuration/McpConfigurationView"
import { Providers } from "./Providers"
import { Boolean, EmptyRequest } from "@shared/proto/common"
import { WebviewProviderType } from "@shared/webview/types"
// 已移除 DiscussionView 导入和 lucide-react Users 图标 —— 旧的多AI讨论独立视图已被移除，讨论功能集成到 ChatView 中

const AppContent = () => {
	const {
		didHydrateState,
		showWelcome,
		shouldShowAnnouncement,
		showMcp,
		mcpTab,
		showSettings,
		showHistory,
		showAccount,
		// 已移除 showDiscussion —— 旧讨论视图状态不再需要
		showAnnouncement,
		setShowAnnouncement,
		setShouldShowAnnouncement,
		closeMcpView,
		navigateToHistory,
		// 已移除 navigateToDiscussion 和 hideDiscussion —— 讨论导航逻辑不再需要
		hideSettings,
		hideHistory,
		hideAccount,
		hideAnnouncement,
	} = useExtensionState()

	useEffect(() => {
		if (shouldShowAnnouncement) {
			setShowAnnouncement(true)

			// Use the gRPC client instead of direct WebviewMessage
			UiServiceClient.onDidShowAnnouncement({} as EmptyRequest)
				.then((response: Boolean) => {
					setShouldShowAnnouncement(response.value)
				})
				.catch((error) => {
					console.error("Failed to acknowledge announcement:", error)
				})
		}
	}, [shouldShowAnnouncement])

	if (!didHydrateState) {
		return null
	}

	return (
		<>
			{showWelcome ? (
				<WelcomeView />
			) : (
				<>
					{showSettings && <SettingsView onDone={hideSettings} />}
				{showHistory && <HistoryView onDone={hideHistory} />}
				{showMcp && <McpView initialTab={mcpTab} onDone={closeMcpView} />}
				{showAccount && <AccountView onDone={hideAccount} />}
				{/* 已移除 DiscussionView 的条件渲染 —— 旧讨论视图已废弃 */}
				{/* Do not conditionally load ChatView, it's expensive and there's state we don't want to lose (user input, disableInput, askResponse promise, etc.) */}
				<ChatView
					showHistoryView={navigateToHistory}
					isHidden={showSettings || showHistory || showMcp || showAccount}
					showAnnouncement={showAnnouncement}
					hideAnnouncement={hideAnnouncement}
				/>
				{/* 已移除浮动讨论按钮 —— 讨论入口已集成到 ChatTextArea 中 */}
			</>
			)}
		</>
	)
}

const App = () => {
	return (
		<Providers>
			<AppContent />
		</Providers>
	)
}

export default App
