import { useCallback } from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { vscode } from "@/utils/vscode"
import type { DiscussionConfig } from "@shared/discussion-types"

/**
 * Custom hook that provides discussion state and actions for multi-AI
 * roundtable discussions. All actions send messages to the extension
 * via vscode.postMessage and rely on ExtensionStateContext to receive
 * updates.
 */
export const useDiscussion = () => {
	const { discussionState, discussionStreamItems, clearDiscussion } = useExtensionState()

	const createDiscussion = useCallback((config: DiscussionConfig) => {
		vscode.postMessage({
			type: "discussion",
			discussionAction: "create",
			discussionConfig: config,
		})
	}, [])

	const sendChatMessage = useCallback((text: string) => {
		vscode.postMessage({
			type: "discussion",
			discussionAction: "chat",
			discussionText: text,
		})
	}, [])

	const stopDiscussion = useCallback(() => {
		vscode.postMessage({
			type: "discussion",
			discussionAction: "stop",
		})
	}, [])

	const generateProposal = useCallback(() => {
		vscode.postMessage({
			type: "discussion",
			discussionAction: "generateProposal",
		})
	}, [])

	const approveProposal = useCallback(() => {
		vscode.postMessage({
			type: "discussion",
			discussionAction: "approveProposal",
		})
	}, [])

	const rejectProposal = useCallback(() => {
		vscode.postMessage({
			type: "discussion",
			discussionAction: "rejectProposal",
		})
	}, [])

	return {
		discussionState,
		discussionStreamItems,
		createDiscussion,
		sendChatMessage,
		stopDiscussion,
		generateProposal,
		approveProposal,
		rejectProposal,
		clearDiscussion,
	}
}
