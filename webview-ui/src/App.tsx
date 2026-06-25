import { useEffect } from "react"
import ChatView from "./components/chat/ChatView"
import HistoryView from "./components/history/HistoryView"
import SettingsView from "./components/settings/SettingsView"
import WelcomeView from "./components/welcome/WelcomeView"
import AccountView from "./components/account/AccountView"
import DiscussionView from "./components/discussion/DiscussionView"
import { useExtensionState } from "./context/ExtensionStateContext"
import { UiServiceClient } from "./services/grpc-client"
import McpView from "./components/mcp/configuration/McpConfigurationView"
import { Providers } from "./Providers"
import { Boolean, EmptyRequest } from "@shared/proto/common"
import { WebviewProviderType } from "@shared/webview/types"
import { Users } from "lucide-react"

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
		showDiscussion,
		showAnnouncement,
		setShowAnnouncement,
		setShouldShowAnnouncement,
		closeMcpView,
		navigateToHistory,
		navigateToDiscussion,
		hideSettings,
		hideHistory,
		hideAccount,
		hideDiscussion,
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
					{showDiscussion && <DiscussionView onDone={hideDiscussion} />}
					{/* Do not conditionally load ChatView, it's expensive and there's state we don't want to lose (user input, disableInput, askResponse promise, etc.) */}
					<ChatView
						showHistoryView={navigateToHistory}
						isHidden={showSettings || showHistory || showMcp || showAccount || showDiscussion}
						showAnnouncement={showAnnouncement}
						hideAnnouncement={hideAnnouncement}
					/>
					{/* Floating button to toggle the discussion view */}
					{!showSettings && !showHistory && !showMcp && !showAccount && !showDiscussion && (
						<button
							onClick={navigateToDiscussion}
							title="Multi-AI Discussion"
							className="fixed bottom-4 right-4 z-[150] flex items-center justify-center w-11 h-11 rounded-full shadow-lg transition-transform hover:scale-110"
							style={{
								backgroundColor: "var(--vscode-button-background)",
								color: "var(--vscode-button-foreground)",
							}}>
							<Users size={20} />
						</button>
					)}
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
