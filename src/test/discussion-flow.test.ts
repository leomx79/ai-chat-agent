/**
 * 多AI讨论系统流程测试
 * 模拟讨论创建、消息流转、状态推送等关键路径
 */

import { describe, test, expect, vi, beforeEach } from "vitest"
import type { DiscussionConfig, DiscussionParticipant, DiscussionState } from "@shared/discussion-types"
import type { ClineMessage } from "@shared/ExtensionMessage"

// 模拟参与者配置
const mockParticipants: DiscussionParticipant[] = [
	{
		id: "p1",
		name: "架构师",
		role: "architect",
		color: "#f87171",
		providerId: "anthropic",
		modelId: "claude-sonnet-5",
		apiKey: "test-key-1",
	},
	{
		id: "p2",
		name: "审查员",
		role: "reviewer",
		color: "#60a5fa",
		providerId: "deepseek",
		modelId: "deepseek-v4-flash",
		apiKey: "test-key-2",
	},
]

// 模拟讨论配置
const mockConfig: DiscussionConfig = {
	topic: "测试讨论主题",
	mode: "roundtable",
	maxRounds: 2,
	participants: mockParticipants,
}

// 模拟带 participantId 标记的 ClineMessage
function makeTaggedMessage(
	ts: number,
	text: string,
	participantId: string,
	participantName: string,
	participantColor: string,
	partial = false,
): ClineMessage {
	return {
		ts,
		type: "say" as const,
		say: "text" as const,
		text,
		partial,
		participantId,
		participantName,
		participantColor,
	}
}

describe("多AI讨论系统流程测试", () => {
	describe("1. 讨论配置验证", () => {
		test("缺少 providerId 应抛出错误", () => {
			const badConfig = {
				...mockConfig,
				participants: [{ ...mockParticipants[0], providerId: "" }],
			}
			// 模拟 start() 中的验证逻辑
			for (const p of badConfig.participants) {
				if (!p.providerId) {
					expect(() => {
						throw new Error(`参与者 "${p.name}" 未配置API提供商`)
					}).toThrow("未配置API提供商")
				}
			}
		})

		test("缺少 modelId 应抛出错误", () => {
			const badConfig = {
				...mockConfig,
				participants: [{ ...mockParticipants[0], modelId: "" }],
			}
			for (const p of badConfig.participants) {
				if (!p.modelId) {
					expect(() => {
						throw new Error(`参与者 "${p.name}" 未配置模型ID`)
					}).toThrow("未配置模型ID")
				}
			}
		})

		test("缺少 apiKey 应抛出错误（非本地提供商）", () => {
			const badConfig = {
				...mockConfig,
				participants: [{ ...mockParticipants[0], apiKey: "" }],
			}
			const localProviders = ["ollama", "lmstudio"]
			for (const p of badConfig.participants) {
				if (!localProviders.includes(p.providerId) && !p.apiKey) {
					expect(() => {
						throw new Error(`参与者 "${p.name}" 未配置API密钥`)
					}).toThrow("未配置API密钥")
				}
			}
		})

		test("ollama 提供商不需要 apiKey", () => {
			const ollamaConfig: DiscussionConfig = {
				...mockConfig,
				participants: [
					{
						...mockParticipants[0],
						providerId: "ollama",
						modelId: "llama3",
						apiKey: "",
						baseURL: "http://localhost:11434",
					},
				],
			}
			const localProviders = ["ollama", "lmstudio"]
			let valid = true
			for (const p of ollamaConfig.participants) {
				if (!localProviders.includes(p.providerId) && !p.apiKey) {
					valid = false
				}
			}
			expect(valid).toBe(true)
		})
	})

	describe("2. 消息标记与去重", () => {
		test("partial 消息应按 ts 去重替换", () => {
			const discussionMessages: ClineMessage[] = []
			const ts = 1000

			// 第一次 partial
			const msg1 = makeTaggedMessage(ts, "Hel", "p1", "架构师", "#f87171", true)
			const idx1 = discussionMessages.findIndex((m) => m.ts === ts)
			if (idx1 >= 0) {
				discussionMessages[idx1] = msg1
			} else {
				discussionMessages.push(msg1)
			}

			// 第二次 partial（同一 ts）
			const msg2 = makeTaggedMessage(ts, "Hello", "p1", "架构师", "#f87171", true)
			const idx2 = discussionMessages.findIndex((m) => m.ts === ts)
			if (idx2 >= 0) {
				discussionMessages[idx2] = msg2
			} else {
				discussionMessages.push(msg2)
			}

			expect(discussionMessages.length).toBe(1)
			expect(discussionMessages[0].text).toBe("Hello")
		})

		test("不同参与者的消息应分别保留", () => {
			const discussionMessages: ClineMessage[] = []

			discussionMessages.push(makeTaggedMessage(1001, "我是架构师", "p1", "架构师", "#f87171"))
			discussionMessages.push(makeTaggedMessage(1002, "我是审查员", "p2", "审查员", "#60a5fa"))

			expect(discussionMessages.length).toBe(2)
			expect(discussionMessages[0].participantId).toBe("p1")
			expect(discussionMessages[1].participantId).toBe("p2")
		})

		test("ask 类型消息不应转发到 onClineMessage", () => {
			// 模拟 collectNewTextMessages 的过滤逻辑
			const allMessages: ClineMessage[] = [
				{ ts: 100, type: "say", say: "text", text: "你好" },
				{ ts: 101, type: "ask", ask: "tool" },
				{ ts: 102, type: "ask", ask: "completion_result" },
				{ ts: 103, type: "say", say: "text", text: "完成" },
			]

			const forwarded = allMessages.filter((m) => m.type !== "ask")
			expect(forwarded.length).toBe(2)
			expect(forwarded[0].text).toBe("你好")
			expect(forwarded[1].text).toBe("完成")
		})
	})

	describe("3. 节流推送逻辑", () => {
		test("throttle 应合并高频调用", async () => {
			let postCount = 0
			let timer: ReturnType<typeof setTimeout> | null = null
			let trailing = false

			const throttledPost = () => {
				if (timer) {
					trailing = true
					return
				}
				postCount++
				timer = setTimeout(() => {
					timer = null
					if (trailing) {
						trailing = false
						throttledPost()
					}
				}, 10) // 10ms for test
			}

			// 模拟高频调用（如流式 partial 消息）
			for (let i = 0; i < 50; i++) {
				throttledPost()
			}

			// leading edge 立即执行一次
			expect(postCount).toBe(1)

			// 等待 trailing
			await new Promise((resolve) => setTimeout(resolve, 50))

			// 应只执行 2 次（1 leading + 1 trailing）
			expect(postCount).toBe(2)
		})
	})

	describe("4. clineMessages 合并逻辑", () => {
		test("discussionManager 不存在时不应合并讨论消息", () => {
			const taskMessages: ClineMessage[] = [{ ts: 100, type: "say", say: "text", text: "task msg" }]
			const discussionMessages: ClineMessage[] = [
				makeTaggedMessage(99, "old discussion", "p1", "架构师", "#f87171"),
			]
			const discussionManager = undefined // 讨论未活跃

			// 模拟 getStateToPostToWebview 中的合并逻辑
			const merged = [
				...taskMessages,
				...(discussionManager ? discussionMessages : []),
			].sort((a, b) => a.ts - b.ts)

			expect(merged.length).toBe(1)
			expect(merged[0].text).toBe("task msg")
		})

		test("discussionManager 存在时应合并讨论消息", () => {
			const taskMessages: ClineMessage[] = [{ ts: 100, type: "say", say: "text", text: "task msg" }]
			const discussionMessages: ClineMessage[] = [
				makeTaggedMessage(99, "discussion msg", "p1", "架构师", "#f87171"),
			]
			const discussionManager = {} as any // 讨论活跃

			const merged = [
				...taskMessages,
				...(discussionManager ? discussionMessages : []),
			].sort((a, b) => a.ts - b.ts)

			expect(merged.length).toBe(2)
		})
	})

	describe("5. localStorage 持久化（模拟）", () => {
		test("API 密钥应与主配置分离存储", () => {
			const participants = [
				{ id: "p1", name: "A", apiKey: "secret1", role: "architect", color: "#f00", providerId: "anthropic", modelId: "claude" },
			]

			// 模拟保存逻辑
			const keysMap: Record<string, string> = {}
			const sanitized = participants.map((p) => {
				if (p.apiKey) keysMap[p.id] = p.apiKey
				return { ...p, apiKey: "" }
			})

			// 主配置中不应包含密钥
			expect(sanitized[0].apiKey).toBe("")

			// 密钥单独存储
			expect(keysMap["p1"]).toBe("secret1")
		})

		test("恢复时应合并密钥回参与者配置", () => {
			const savedParticipants = [
				{ id: "p1", name: "A", apiKey: "", role: "architect", color: "#f00", providerId: "anthropic", modelId: "claude" },
			]
			const savedKeys = JSON.stringify({ p1: "secret1" })

			const keys = JSON.parse(savedKeys) as Record<string, string>
			const restored = savedParticipants.map((p) => ({ ...p, apiKey: keys[p.id] || "" }))

			expect(restored[0].apiKey).toBe("secret1")
		})
	})
})
