import { useExtensionState } from "@/context/ExtensionStateContext"
import { ModelsServiceClient } from "@/services/grpc-client"
import { getAsVar, VSC_DESCRIPTION_FOREGROUND } from "@/utils/vscStyles"
import {
	ApiConfiguration,
	bedrockDefaultModelId,
	bedrockModels,
	cerebrasModels,
	claudeCodeModels,
	doubaoModels,
	geminiModels,
	internationalQwenModels,
	liteLlmModelInfoSaneDefaults,
	mainlandQwenModels,
	ModelInfo,
	nebiusModels,
	vertexGlobalModels,
	vertexModels,
	xaiModels,
	sapAiCoreModels,
} from "@shared/api"
import { EmptyRequest, StringRequest } from "@shared/proto/common"
import { OpenAiModelsRequest, UpdateApiConfigurationRequest } from "@shared/proto/models"
import { convertApiConfigurationToProto } from "@shared/proto-conversions/models/api-configuration-conversion"
import {
	VSCodeButton,
	VSCodeCheckbox,
	VSCodeDropdown,
	VSCodeLink,
	VSCodeOption,
	VSCodeRadio,
	VSCodeRadioGroup,
	VSCodeTextField,
} from "@vscode/webview-ui-toolkit/react"
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useInterval } from "react-use"
import styled from "styled-components"
import * as vscodemodels from "vscode"
import { ClineAccountInfoCard } from "./ClineAccountInfoCard"
import OllamaModelPicker from "./OllamaModelPicker"
import OpenRouterModelPicker, { ModelDescriptionMarkdown, OPENROUTER_MODEL_PICKER_Z_INDEX } from "./OpenRouterModelPicker"
import RequestyModelPicker from "./RequestyModelPicker"
import ThinkingBudgetSlider from "./ThinkingBudgetSlider"
import { formatPrice } from "./utils/pricingUtils"
import { normalizeApiConfiguration } from "./utils/providerUtils"

import { OpenRouterProvider } from "./providers/OpenRouterProvider"
import { MistralProvider } from "./providers/MistralProvider"
import { DeepSeekProvider } from "./providers/DeepSeekProvider"
import { TogetherProvider } from "./providers/TogetherProvider"
import { OpenAICompatibleProvider } from "./providers/OpenAICompatible"
import { SambanovaProvider } from "./providers/SambanovaProvider"
import { AnthropicProvider } from "./providers/AnthropicProvider"
import { AskSageProvider } from "./providers/AskSageProvider"
import { OpenAINativeProvider } from "./providers/OpenAINative"
import { GeminiProvider } from "./providers/GeminiProvider"
import GeminiCliProvider from "./providers/GeminiCliProvider"

interface ApiOptionsProps {
	showModelOptions: boolean
	apiErrorMessage?: string
	modelIdErrorMessage?: string
	isPopup?: boolean
	saveImmediately?: boolean // Add prop to control immediate saving
}

const SUPPORTED_THINKING_MODELS: Record<string, string[]> = {
	vertex: [
		"claude-3-7-sonnet@20250219",
		"claude-sonnet-4@20250514",
		"claude-opus-4@20250514",
		"gemini-2.5-flash-preview-05-20",
		"gemini-2.5-flash-preview-04-17",
		"gemini-2.5-pro-preview-06-05",
	],
	qwen: [
		"qwen3-235b-a22b",
		"qwen3-32b",
		"qwen3-30b-a3b",
		"qwen3-14b",
		"qwen3-8b",
		"qwen3-4b",
		"qwen3-1.7b",
		"qwen3-0.6b",
		"qwen-plus-latest",
		"qwen-turbo-latest",
	],
}

// This is necessary to ensure dropdown opens downward, important for when this is used in popup
const DROPDOWN_Z_INDEX = OPENROUTER_MODEL_PICKER_Z_INDEX + 2 // Higher than the OpenRouterModelPicker's and ModelSelectorTooltip's z-index

export const DropdownContainer = styled.div<{ zIndex?: number }>`
	position: relative;
	z-index: ${(props) => props.zIndex || DROPDOWN_Z_INDEX};

	// Force dropdowns to open downward
	& vscode-dropdown::part(listbox) {
		position: absolute !important;
		top: 100% !important;
		bottom: auto !important;
	}
`

declare module "vscode" {
	interface LanguageModelChatSelector {
		vendor?: string
		family?: string
		version?: string
		id?: string
	}
}

const ApiOptions = ({
	showModelOptions,
	apiErrorMessage,
	modelIdErrorMessage,
	isPopup,
	saveImmediately = false, // Default to false
}: ApiOptionsProps) => {
	// Use full context state for immediate save payload
	const extensionState = useExtensionState()
	const { apiConfiguration, setApiConfiguration, uriScheme } = extensionState
	const [ollamaModels, setOllamaModels] = useState<string[]>([])
	const [lmStudioModels, setLmStudioModels] = useState<string[]>([])
	const [vsCodeLmModels, setVsCodeLmModels] = useState<vscodemodels.LanguageModelChatSelector[]>([])
	const [awsEndpointSelected, setAwsEndpointSelected] = useState(!!apiConfiguration?.awsBedrockEndpoint)
	const [modelConfigurationSelected, setModelConfigurationSelected] = useState(false)
	const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
	const [providerSortingSelected, setProviderSortingSelected] = useState(!!apiConfiguration?.openRouterProviderSorting)
	const [reasoningEffortSelected, setReasoningEffortSelected] = useState(!!apiConfiguration?.reasoningEffort)

	const handleInputChange = (field: keyof ApiConfiguration) => (event: any) => {
		const newValue = event.target.value

		// Update local state
		setApiConfiguration({
			...apiConfiguration,
			[field]: newValue,
		})

		// If the field is the provider AND saveImmediately is true, save it immediately using the full context state
		if (saveImmediately && field === "apiProvider") {
			// Use apiConfiguration from the full extensionState context to send the most complete data
			const currentFullApiConfig = extensionState.apiConfiguration

			// Convert to proto format and send via gRPC
			const updatedConfig = {
				...currentFullApiConfig,
				apiProvider: newValue,
			}
			const protoConfig = convertApiConfigurationToProto(updatedConfig)
			ModelsServiceClient.updateApiConfigurationProto(
				UpdateApiConfigurationRequest.create({
					apiConfiguration: protoConfig,
				}),
			).catch((error) => {
				console.error("Failed to update API configuration:", error)
			})
		}
	}

	const { selectedProvider, selectedModelId, selectedModelInfo } = useMemo(() => {
		return normalizeApiConfiguration(apiConfiguration)
	}, [apiConfiguration])

	// Poll ollama/lmstudio models
	const requestLocalModels = useCallback(async () => {
		if (selectedProvider === "ollama") {
			try {
				const response = await ModelsServiceClient.getOllamaModels(
					StringRequest.create({
						value: apiConfiguration?.ollamaBaseUrl || "",
					}),
				)
				if (response && response.values) {
					setOllamaModels(response.values)
				}
			} catch (error) {
				console.error("Failed to fetch Ollama models:", error)
				setOllamaModels([])
			}
		} else if (selectedProvider === "lmstudio") {
			try {
				const response = await ModelsServiceClient.getLmStudioModels(
					StringRequest.create({
						value: apiConfiguration?.lmStudioBaseUrl || "",
					}),
				)
				if (response && response.values) {
					setLmStudioModels(response.values)
				}
			} catch (error) {
				console.error("Failed to fetch LM Studio models:", error)
				setLmStudioModels([])
			}
		} else if (selectedProvider === "vscode-lm") {
			try {
				const response = await ModelsServiceClient.getVsCodeLmModels(EmptyRequest.create({}))
				if (response && response.models) {
					setVsCodeLmModels(response.models)
				}
			} catch (error) {
				console.error("Failed to fetch VS Code LM models:", error)
				setVsCodeLmModels([])
			}
		}
	}, [selectedProvider, apiConfiguration?.ollamaBaseUrl, apiConfiguration?.lmStudioBaseUrl])
	useEffect(() => {
		if (selectedProvider === "ollama" || selectedProvider === "lmstudio" || selectedProvider === "vscode-lm") {
			requestLocalModels()
		}
	}, [selectedProvider, requestLocalModels])
	useInterval(
		requestLocalModels,
		selectedProvider === "ollama" || selectedProvider === "lmstudio" || selectedProvider === "vscode-lm" ? 2000 : null,
	)

	/*
	VSCodeDropdown has an open bug where dynamically rendered options don't auto select the provided value prop. You can see this for yourself by comparing  it with normal select/option elements, which work as expected.
	https://github.com/microsoft/vscode-webview-ui-toolkit/issues/433

	In our case, when the user switches between providers, we recalculate the selectedModelId depending on the provider, the default model for that provider, and a modelId that the user may have selected. Unfortunately, the VSCodeDropdown component wouldn't select this calculated value, and would default to the first "Select a model..." option instead, which makes it seem like the model was cleared out when it wasn't.

	As a workaround, we create separate instances of the dropdown for each provider, and then conditionally render the one that matches the current provider.
	*/
	const createDropdown = (models: Record<string, ModelInfo>) => {
		return (
			<VSCodeDropdown
				id="model-id"
				value={selectedModelId}
				onChange={handleInputChange("apiModelId")}
				style={{ width: "100%" }}>
				<VSCodeOption value="">选择模型...</VSCodeOption>
			{Object.keys(models).map((modelId) => (
					<VSCodeOption
						key={modelId}
						value={modelId}
						style={{
							whiteSpace: "normal",
							wordWrap: "break-word",
							maxWidth: "100%",
						}}>
						{modelId}
					</VSCodeOption>
				))}
			</VSCodeDropdown>
		)
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: isPopup ? -10 : 0 }}>
			<DropdownContainer className="dropdown-container">
				<label htmlFor="api-provider">
					<span style={{ fontWeight: 500 }}>API Provider</span>
				</label>
				<VSCodeDropdown
					id="api-provider"
					value={selectedProvider}
					onChange={handleInputChange("apiProvider")}
					style={{
						minWidth: 130,
						position: "relative",
					}}>
					<VSCodeOption value="cline">Cline</VSCodeOption>
				<VSCodeOption value="openrouter">OpenRouter</VSCodeOption>
				<VSCodeOption value="anthropic">Anthropic</VSCodeOption>
				<VSCodeOption value="claude-code">Claude Code</VSCodeOption>
				<VSCodeOption value="bedrock">Amazon Bedrock</VSCodeOption>
				<VSCodeOption value="openai">OpenAI 兼容</VSCodeOption>
				<VSCodeOption value="vertex">GCP Vertex AI</VSCodeOption>
				<VSCodeOption value="gemini">Google Gemini</VSCodeOption>
				<VSCodeOption value="gemini-cli">Gemini CLI 提供商</VSCodeOption>
				<VSCodeOption value="deepseek">DeepSeek</VSCodeOption>
				<VSCodeOption value="mistral">Mistral</VSCodeOption>
				<VSCodeOption value="openai-native">OpenAI</VSCodeOption>
				<VSCodeOption value="vscode-lm">VS Code LM API</VSCodeOption>
				<VSCodeOption value="requesty">Requesty</VSCodeOption>
				<VSCodeOption value="fireworks">Fireworks</VSCodeOption>
				<VSCodeOption value="together">Together</VSCodeOption>
				<VSCodeOption value="qwen">阿里巴巴通义千问</VSCodeOption>
				<VSCodeOption value="doubao">字节跳动豆包</VSCodeOption>
				<VSCodeOption value="lmstudio">LM Studio</VSCodeOption>
				<VSCodeOption value="ollama">Ollama</VSCodeOption>
				<VSCodeOption value="litellm">LiteLLM</VSCodeOption>
				<VSCodeOption value="nebius">Nebius AI Studio</VSCodeOption>
				<VSCodeOption value="asksage">AskSage</VSCodeOption>
				<VSCodeOption value="xai">xAI</VSCodeOption>
				<VSCodeOption value="sambanova">SambaNova</VSCodeOption>
				<VSCodeOption value="cerebras">Cerebras</VSCodeOption>
				<VSCodeOption value="sapaicore">SAP AI Core</VSCodeOption>
				</VSCodeDropdown>
			</DropdownContainer>

			{selectedProvider === "cline" && (
				<div style={{ marginBottom: 14, marginTop: 4 }}>
					<ClineAccountInfoCard />
				</div>
			)}

			{apiConfiguration && selectedProvider === "asksage" && (
				<AskSageProvider
					apiConfiguration={apiConfiguration}
					handleInputChange={handleInputChange}
					showModelOptions={showModelOptions}
					isPopup={isPopup}
				/>
			)}

			{apiConfiguration && selectedProvider === "anthropic" && (
				<AnthropicProvider
					apiConfiguration={apiConfiguration}
					handleInputChange={handleInputChange}
					showModelOptions={showModelOptions}
					isPopup={isPopup}
					setApiConfiguration={setApiConfiguration}
				/>
			)}

			{selectedProvider === "claude-code" && (
				<div>
					<VSCodeTextField
						value={apiConfiguration?.claudeCodePath || ""}
						style={{ width: "100%", marginTop: 3 }}
						type="text"
						onInput={handleInputChange("claudeCodePath")}
						placeholder="默认: claude"
					/>

					<p
						style={{
							fontSize: "12px",
							marginTop: 3,
							color: "var(--vscode-descriptionForeground)",
						}}>
						Claude Code CLI 的路径。
					</p>
				</div>
			)}

			{apiConfiguration && selectedProvider === "openai-native" && (
				<OpenAINativeProvider
					apiConfiguration={apiConfiguration}
					handleInputChange={handleInputChange}
					showModelOptions={showModelOptions}
					isPopup={isPopup}
				/>
			)}

			{selectedProvider === "qwen" && (
				<div>
					<DropdownContainer className="dropdown-container" style={{ position: "inherit" }}>
						<label htmlFor="qwen-line-provider">
							<span style={{ fontWeight: 500, marginTop: 5 }}>Alibaba API Line</span>
						</label>
						<VSCodeDropdown
							id="qwen-line-provider"
							value={apiConfiguration?.qwenApiLine || "china"}
							onChange={handleInputChange("qwenApiLine")}
							style={{
								minWidth: 130,
								position: "relative",
							}}>
							<VSCodeOption value="china">China API</VSCodeOption>
							<VSCodeOption value="international">International API</VSCodeOption>
						</VSCodeDropdown>
					</DropdownContainer>
					<p
						style={{
							fontSize: "12px",
							marginTop: 3,
							color: "var(--vscode-descriptionForeground)",
						}}>
						Please select the appropriate API interface based on your location. If you are in China, choose the China
						API interface. Otherwise, choose the International API interface.
					</p>
					<VSCodeTextField
						value={apiConfiguration?.qwenApiKey || ""}
						style={{ width: "100%" }}
						type="password"
						onInput={handleInputChange("qwenApiKey")}
						placeholder="输入 API 密钥...">
						<span style={{ fontWeight: 500 }}>通义千问 API 密钥</span>
					</VSCodeTextField>
					<p
						style={{
							fontSize: "12px",
							marginTop: 3,
							color: "var(--vscode-descriptionForeground)",
						}}>
						此密钥在本地存储，仅用于从此扩展发起 API 请求。
						{!apiConfiguration?.qwenApiKey && (
							<VSCodeLink
								href="https://bailian.console.aliyun.com/"
								style={{
									display: "inline",
									fontSize: "inherit",
								}}>
								您可以在此注册获取通义千问 API 密钥。
							</VSCodeLink>
						)}
					</p>
				</div>
			)}

			{selectedProvider === "doubao" && (
				<div>
					<VSCodeTextField
						value={apiConfiguration?.doubaoApiKey || ""}
						style={{ width: "100%" }}
						type="password"
						onInput={handleInputChange("doubaoApiKey")}
						placeholder="输入 API 密钥...">
						<span style={{ fontWeight: 500 }}>豆包 API 密钥</span>
					</VSCodeTextField>
					<p
						style={{
							fontSize: "12px",
							marginTop: 3,
							color: "var(--vscode-descriptionForeground)",
						}}>
						This key is stored locally and only used to make API requests from this extension.
						{!apiConfiguration?.doubaoApiKey && (
							<VSCodeLink
								href="https://console.volcengine.com/home"
								style={{
									display: "inline",
									fontSize: "inherit",
								}}>
								You can get a Doubao API key by signing up here.
							</VSCodeLink>
						)}
					</p>
				</div>
			)}

			{apiConfiguration && selectedProvider === "mistral" && (
				<MistralProvider
					apiConfiguration={apiConfiguration}
					handleInputChange={handleInputChange}
					showModelOptions={showModelOptions}
					isPopup={isPopup}
				/>
			)}

			{apiConfiguration && selectedProvider === "openrouter" && (
				<OpenRouterProvider
					apiConfiguration={apiConfiguration}
					handleInputChange={handleInputChange}
					showModelOptions={showModelOptions}
					isPopup={isPopup}
					uriScheme={uriScheme}
				/>
			)}

			{apiConfiguration && selectedProvider === "deepseek" && (
				<DeepSeekProvider
					apiConfiguration={apiConfiguration}
					handleInputChange={handleInputChange}
					showModelOptions={showModelOptions}
					isPopup={isPopup}
				/>
			)}

			{apiConfiguration && selectedProvider === "together" && (
				<TogetherProvider
					apiConfiguration={apiConfiguration}
					handleInputChange={handleInputChange}
					showModelOptions={showModelOptions}
					isPopup={isPopup}
				/>
			)}

			{apiConfiguration && selectedProvider === "openai" && (
				<OpenAICompatibleProvider
					apiConfiguration={apiConfiguration}
					handleInputChange={handleInputChange}
					showModelOptions={showModelOptions}
					isPopup={isPopup}
				/>
			)}

			{apiConfiguration && selectedProvider === "sambanova" && (
				<SambanovaProvider
					apiConfiguration={apiConfiguration}
					handleInputChange={handleInputChange}
					showModelOptions={showModelOptions}
					isPopup={isPopup}
				/>
			)}

			{selectedProvider === "bedrock" && (
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 5,
					}}>
					<VSCodeRadioGroup
						value={apiConfiguration?.awsUseProfile ? "profile" : "credentials"}
						onChange={(e) => {
							const value = (e.target as HTMLInputElement)?.value
							const useProfile = value === "profile"
							setApiConfiguration({
								...apiConfiguration,
								awsUseProfile: useProfile,
							})
						}}>
						<VSCodeRadio value="credentials">AWS Credentialsedentialsedentials</VSCodeRadio>
						<VSCodeRadio value="profile">AWS Profileileile</VSCodeRadio>
					</VSCodeRadioGroup>

					{apiConfiguration?.awsUseProfile ? (
						<VSCodeTextField
							value={apiConfiguration?.awsProfile || ""}
							style={{ width: "100%" }}
							onInput={handleInputChange("awsProfile")}
							placeholder="输入配置文件名称（留空则使用默认）">
							<span style={{ fontWeight: 500 }}>AWS 配置文件名称</span>
						</VSCodeTextField>
					) : (
						<>
							<VSCodeTextField
								value={apiConfiguration?.awsAccessKey || ""}
								style={{ width: "100%" }}
								type="password"
								onInput={handleInputChange("awsAccessKey")}
								placeholder="输入访问密钥...">
								<span style={{ fontWeight: 500 }}>AWS 访问密钥</span>
							</VSCodeTextField>
							<VSCodeTextField
								value={apiConfiguration?.awsSecretKey || ""}
								style={{ width: "100%" }}
								type="password"
								onInput={handleInputChange("awsSecretKey")}
								placeholder="输入秘密密钥...">
								<span style={{ fontWeight: 500 }}>AWS 秘密密钥</span>
							</VSCodeTextField>
							<VSCodeTextField
								value={apiConfiguration?.awsSessionToken || ""}
								style={{ width: "100%" }}
								type="password"
								onInput={handleInputChange("awsSessionToken")}
								placeholder="输入会话令牌...">
								<span style={{ fontWeight: 500 }}>AWS 会话令牌</span>
							</VSCodeTextField>
						</>
					)}
					<DropdownContainer zIndex={DROPDOWN_Z_INDEX - 1} className="dropdown-container">
						<label htmlFor="aws-region-dropdown">
							<span style={{ fontWeight: 500 }}>AWS Region</span>
						</label>
						<VSCodeDropdown
							id="aws-region-dropdown"
							value={apiConfiguration?.awsRegion || ""}
							style={{ width: "100%" }}
							onChange={handleInputChange("awsRegion")}>
							<VSCodeOption value="">选择区域...</VSCodeOption>
							{/* The user will have to choose a region that supports the model they use, but this shouldn't be a problem since they'd have to request access for it in that region in the first place. */}
							<VSCodeOption value="us-east-1">us-east-1</VSCodeOption>
							<VSCodeOption value="us-east-2">us-east-2</VSCodeOption>
							{/* <VSCodeOption value="us-west-1">us-west-1</VSCodeOption> */}
							<VSCodeOption value="us-west-2">us-west-2</VSCodeOption>
							{/* <VSCodeOption value="af-south-1">af-south-1</VSCodeOption> */}
							{/* <VSCodeOption value="ap-east-1">ap-east-1</VSCodeOption> */}
							<VSCodeOption value="ap-south-1">ap-south-1</VSCodeOption>
							<VSCodeOption value="ap-northeast-1">ap-northeast-1</VSCodeOption>
							<VSCodeOption value="ap-northeast-2">ap-northeast-2</VSCodeOption>
							<VSCodeOption value="ap-northeast-3">ap-northeast-3</VSCodeOption>
							<VSCodeOption value="ap-southeast-1">ap-southeast-1</VSCodeOption>
							<VSCodeOption value="ap-southeast-2">ap-southeast-2</VSCodeOption>
							<VSCodeOption value="ca-central-1">ca-central-1</VSCodeOption>
							<VSCodeOption value="eu-central-1">eu-central-1</VSCodeOption>
							<VSCodeOption value="eu-central-2">eu-central-2</VSCodeOption>
							<VSCodeOption value="eu-west-1">eu-west-1</VSCodeOption>
							<VSCodeOption value="eu-west-2">eu-west-2</VSCodeOption>
							<VSCodeOption value="eu-west-3">eu-west-3</VSCodeOption>
							<VSCodeOption value="eu-north-1">eu-north-1</VSCodeOption>
							<VSCodeOption value="eu-south-1">eu-south-1</VSCodeOption>
							<VSCodeOption value="eu-south-2">eu-south-2</VSCodeOption>
							{/* <VSCodeOption value="me-south-1">me-south-1</VSCodeOption> */}
							<VSCodeOption value="sa-east-1">sa-east-1</VSCodeOption>
							<VSCodeOption value="us-gov-east-1">us-gov-east-1</VSCodeOption>
							<VSCodeOption value="us-gov-west-1">us-gov-west-1</VSCodeOption>
							{/* <VSCodeOption value="us-gov-east-1">us-gov-east-1</VSCodeOption> */}
						</VSCodeDropdown>
					</DropdownContainer>

					<div style={{ display: "flex", flexDirection: "column" }}>
						<VSCodeCheckbox
							checked={awsEndpointSelected}
							onChange={(e: any) => {
								const isChecked = e.target.checked === true
								setAwsEndpointSelected(isChecked)
								if (!isChecked) {
									setApiConfiguration({
										...apiConfiguration,
										awsBedrockEndpoint: "",
									})
								}
							}}>
							Useucustom stomendpointtomendpointtomendpointPC endpoint
						</VSCodeCheckbox>

						{awsEndpointSelected && (
							<VSCodeTextField
								value={apiConfiguration?.awsBedrockEndpoint || ""}
								style={{ width: "100%", marginTop: 3, marginBottom: 5 }}
								type="url"
								onInput={handleInputChange("awsBedrockEndpoint")}
								placeholder="输入 VPC 端点 URL（可选）"
							/>
						)}

						<VSCodeCheckbox
							checked={apiConfiguration?.awsUseCrossRegionInference || false}
							onChange={(e: any) => {
								const isChecked = e.target.checked === true
								setApiConfiguration({
									...apiConfiguration,
									awsUseCrossRegionInference: isChecked,
								})
							}}>
							使用跨区域推理
						</VSCodeCheckbox>

						{selectedModelInfo.supportsPromptCache && (
							<>
								<VSCodeCheckbox
									checked={apiConfiguration?.awsBedrockUsePromptCache || false}
									onChange={(e: any) => {
										const isChecked = e.target.checked === true
										setApiConfiguration({
											...apiConfiguration,
											awsBedrockUsePromptCache: isChecked,
										})
									}}>
									使用提示缓存
								</VSCodeCheckbox>
							</>
						)}
					</div>
					<p
						style={{
							fontSize: "12px",
							marginTop: "5px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						{apiConfiguration?.awsUseProfile ? (
							<>
								使用来自 ~/.aws/credentials 的 AWS 配置文件凭证。留空配置文件名称以使用默认配置文件。这些凭证仅在本地用于从此扩展发起 API 请求。
							</>
						) : (
							<>
								通过提供上述密钥或使用默认 AWS 凭证提供程序（即 ~/.aws/credentials 或环境变量）进行身份验证。这些凭证仅在本地用于从此扩展发起 API 请求。
							</>
						)}
					</p>
					<label htmlFor="bedrock-model-dropdown">
						<span style={{ fontWeight: 500 }}>Model</span>
					</label>
					<DropdownContainer zIndex={DROPDOWN_Z_INDEX - 2} className="dropdown-container">
						<VSCodeDropdown
							id="bedrock-model-dropdown"
							value={apiConfiguration?.awsBedrockCustomSelected ? "custom" : selectedModelId}
							onChange={(e: any) => {
								const isCustom = e.target.value === "custom"
								setApiConfiguration({
									...apiConfiguration,
									apiModelId: isCustom ? "" : e.target.value,
									awsBedrockCustomSelected: isCustom,
									awsBedrockCustomModelBaseId: bedrockDefaultModelId,
								})
							}}
							style={{ width: "100%" }}>
							<VSCodeOption value="">选择模型...</VSCodeOption>
						{Object.keys(bedrockModels).map((modelId) => (
							<VSCodeOption
								key={modelId}
								value={modelId}
								style={{
									whiteSpace: "normal",
									wordWrap: "break-word",
									maxWidth: "100%",
								}}>
								{modelId}
							</VSCodeOption>
						))}
						<VSCodeOption value="custom">自定义</VSCodeOption>
						</VSCodeDropdown>
					</DropdownContainer>
					{apiConfiguration?.awsBedrockCustomSelected && (
						<div>
							<p
								style={{
									fontSize: "12px",
									marginTop: "5px",
									color: "var(--vscode-descriptionForeground)",
								}}>
								选择"自定义"以在 Bedrock 中使用应用程序推理配置文件。在模型 ID 字段中输入应用程序推理配置文件 ARN。
							</p>
							<label htmlFor="bedrock-model-input">
								<span style={{ fontWeight: 500 }}>模型 ID</span>
						</label>
						<VSCodeTextField
							id="bedrock-model-input"
								value={apiConfiguration?.apiModelId || ""}
								style={{ width: "100%", marginTop: 3 }}
								onInput={handleInputChange("apiModelId")}
								placeholder="Enter custom model ID..."
							/>
							<label htmlFor="bedrock-base-model-dropdown">
								<span style={{ fontWeight: 500 }}>Base Inference Model</span>
							</label>
							<DropdownContainer zIndex={DROPDOWN_Z_INDEX - 3} className="dropdown-container">
								<VSCodeDropdown
									id="bedrock-base-model-dropdown"
									value={apiConfiguration?.awsBedrockCustomModelBaseId || bedrockDefaultModelId}
									onChange={handleInputChange("awsBedrockCustomModelBaseId")}
									style={{ width: "100%" }}>
									<VSCodeOption value="">选择模型...</VSCodeOption>
									{Object.keys(bedrockModels).map((modelId) => (
										<VSCodeOption
											key={modelId}
											value={modelId}
											style={{
												whiteSpace: "normal",
												wordWrap: "break-word",
												maxWidth: "100%",
											}}>
											{modelId}
										</VSCodeOption>
									))}
								</VSCodeDropdown>
							</DropdownContainer>
						</div>
					)}
					{(selectedModelId === "anthropic.claude-3-7-sonnet-20250219-v1:0" ||
						selectedModelId === "anthropic.claude-sonnet-4-20250514-v1:0" ||
						selectedModelId === "anthropic.claude-opus-4-20250514-v1:0" ||
						(apiConfiguration?.awsBedrockCustomSelected &&
							apiConfiguration?.awsBedrockCustomModelBaseId === "anthropic.claude-3-7-sonnet-20250219-v1:0") ||
						(apiConfiguration?.awsBedrockCustomSelected &&
							apiConfiguration?.awsBedrockCustomModelBaseId === "anthropic.claude-sonnet-4-20250514-v1:0") ||
						(apiConfiguration?.awsBedrockCustomSelected &&
							apiConfiguration?.awsBedrockCustomModelBaseId === "anthropic.claude-opus-4-20250514-v1:0")) && (
						<ThinkingBudgetSlider apiConfiguration={apiConfiguration} setApiConfiguration={setApiConfiguration} />
					)}
					<ModelInfoView
						selectedModelId={selectedModelId}
						modelInfo={selectedModelInfo}
						isDescriptionExpanded={isDescriptionExpanded}
						setIsDescriptionExpanded={setIsDescriptionExpanded}
						isPopup={isPopup}
					/>
				</div>
			)}

			{apiConfiguration?.apiProvider === "vertex" && (
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 5,
					}}>
					<VSCodeTextField
						value={apiConfiguration?.vertexProjectId || ""}
						style={{ width: "100%" }}
						onInput={handleInputChange("vertexProjectId")}
						placeholder="输入项目 ID...">
						<span style={{ fontWeight: 500 }}>Google Cloud 项目 ID</span>
					</VSCodeTextField>
					<DropdownContainer zIndex={DROPDOWN_Z_INDEX - 1} className="dropdown-container">
						<label htmlFor="vertex-region-dropdown">
							<span style={{ fontWeight: 500 }}>Google Cloud Region</span>
						</label>
						<VSCodeDropdown
							id="vertex-region-dropdown"
							value={apiConfiguration?.vertexRegion || ""}
							style={{ width: "100%" }}
							onChange={handleInputChange("vertexRegion")}>
							<VSCodeOption value="">选择区域...</VSCodeOption>
							<VSCodeOption value="us-east5">us-east5</VSCodeOption>
							<VSCodeOption value="us-central1">us-central1</VSCodeOption>
							<VSCodeOption value="europe-west1">europe-west1</VSCodeOption>
							<VSCodeOption value="europe-west4">europe-west4</VSCodeOption>
							<VSCodeOption value="asia-southeast1">asia-southeast1</VSCodeOption>
							<VSCodeOption value="global">global</VSCodeOption>
						</VSCodeDropdown>
					</DropdownContainer>
					<p
						style={{
							fontSize: "12px",
							marginTop: "5px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						要使用 Google Cloud Vertex AI，您需要
						<VSCodeLink
							href="https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-claude#before_you_begin"
							style={{ display: "inline", fontSize: "inherit" }}>
							{"1) 创建 Google Cloud 账户 › 启用 Vertex AI API › 启用所需的 Claude 模型，"}
						</VSCodeLink>{" "}
						<VSCodeLink
							href="https://cloud.google.com/docs/authentication/provide-credentials-adc#google-idp"
							style={{ display: "inline", fontSize: "inherit" }}>
							{"2) 安装 Google Cloud CLI › 配置应用默认凭证。"}
						</VSCodeLink>
					</p>
				</div>
			)}

			{apiConfiguration && selectedProvider === "gemini" && (
				<GeminiProvider
					apiConfiguration={apiConfiguration}
					handleInputChange={handleInputChange}
					showModelOptions={showModelOptions}
					isPopup={isPopup}
					setApiConfiguration={setApiConfiguration}
				/>
			)}

			{apiConfiguration && selectedProvider === "gemini-cli" && (
				<GeminiCliProvider
					apiConfiguration={apiConfiguration}
					handleInputChange={handleInputChange}
					showModelOptions={showModelOptions}
					isPopup={isPopup}
				/>
			)}

			{selectedProvider === "requesty" && (
				<div>
					<VSCodeTextField
						value={apiConfiguration?.requestyApiKey || ""}
						style={{ width: "100%" }}
						type="password"
						onInput={handleInputChange("requestyApiKey")}
						placeholder="输入 API 密钥...">
					<span style={{ fontWeight: 500 }}>API 密钥</span>
				</VSCodeTextField>
				{!apiConfiguration?.requestyApiKey && <a href="https://app.requesty.ai/manage-api">获取 API 密钥</a>}
				</div>
			)}

			{selectedProvider === "fireworks" && (
				<div>
					<VSCodeTextField
						value={apiConfiguration?.fireworksApiKey || ""}
						style={{ width: "100%" }}
						type="password"
						onInput={handleInputChange("fireworksApiKey")}
						placeholder="输入 API 密钥...">
					<span style={{ fontWeight: 500 }}>Fireworks API 密钥</span>
				</VSCodeTextField>
				<p
					style={{
						fontSize: "12px",
						marginTop: 3,
						color: "var(--vscode-descriptionForeground)",
					}}>
					此密钥在本地存储，仅用于从此扩展发起 API 请求。
					{!apiConfiguration?.fireworksApiKey && (
						<VSCodeLink
							href="https://fireworks.ai/settings/users/api-keys"
							style={{
								display: "inline",
								fontSize: "inherit",
							}}>
							您可以在此注册获取 Fireworks API 密钥。
						</VSCodeLink>
						)}
					</p>
					<VSCodeTextField
						value={apiConfiguration?.fireworksModelId || ""}
						style={{ width: "100%" }}
						onInput={handleInputChange("fireworksModelId")}
						placeholder={"EnterrModel  Model ID..."}>
						<span style={{ fontWeight: 500 }}>Modeldel ID</span>
					</VSCodeTextField>
					<p
						style={{
							fontSize: "12px",
							marginTop: 3,
							color: "var(--vscode-descriptionForeground)",
						}}>
						<span style={{ color: "var(--vscode-errorForeground)" }}>
							(<span style={{ fontWeight: 500 }}>Note:</span> Cline uses complex prompts and works best with Claude
							models. Less capable models may not work as expected.)
						</span>
					</p>
					<VSCodeTextField
						value={apiConfiguration?.fireworksModelMaxCompletionTokens?.toString() || ""}
						style={{ width: "100%", marginBottom: 8 }}
						onInput={(e) => {
							const value = (e.target as HTMLInputElement).value
							if (!value) {
								return
							}
							const num = parseInt(value, 10)
							if (isNaN(num)) {
								return
							}
							handleInputChange("fireworksModelMaxCompletionTokens")({
								target: {
									value: num,
								},
							})
						}}
						placeholder={"2000"}>
						<span style={{ fontWeight: 500 }}>Max CompletionCompletion Tokens</span>
					</VSCodeTextField>
					<VSCodeTextField
						value={apiConfiguration?.fireworksModelMaxTokens?.toString() || ""}
						style={{ width: "100%", marginBottom: 8 }}
						onInput={(e) => {
							const value = (e.target as HTMLInputElement).value
							if (!value) {
								return
							}
							const num = parseInt(value)
							if (isNaN(num)) {
								return
							}
							handleInputChange("fireworksModelMaxTokens")({
								target: {
									value: num,
								},
							})
						}}
						placeholder={"4000"}>
						<span style={{ fontWeight: 500 }}>Max Context Tokens</span>
					</VSCodeTextField>
				</div>
			)}

			{selectedProvider === "vscode-lm" && (
				<div>
					<DropdownContainer zIndex={DROPDOWN_Z_INDEX - 2} className="dropdown-container">
						<label htmlFor="vscode-lm-model">
						<span style={{ fontWeight: 500 }}>语言模型</span>
					</label>
						{vsCodeLmModels.length > 0 ? (
							<VSCodeDropdown
								id="vscode-lm-model"
								value={
									apiConfiguration?.vsCodeLmModelSelector
										? `${apiConfiguration.vsCodeLmModelSelector.vendor ?? ""}/${apiConfiguration.vsCodeLmModelSelector.family ?? ""}`
										: ""
								}
								onChange={(e) => {
									const value = (e.target as HTMLInputElement).value
									if (!value) {
										return
									}
									const [vendor, family] = value.split("/")
									handleInputChange("vsCodeLmModelSelector")({
										target: {
											value: { vendor, family },
										},
									})
								}}
								style={{ width: "100%" }}>
								<VSCodeOption value="">选择模型...</VSCodeOption>
							{vsCodeLmModels.map((model) => (
									<VSCodeOption
										key={`${model.vendor}/${model.family}`}
										value={`${model.vendor}/${model.family}`}>
										{model.vendor} - {model.family}
									</VSCodeOption>
								))}
							</VSCodeDropdown>
						) : (
							<p
								style={{
									fontSize: "12px",
									marginTop: "5px",
									color: "var(--vscode-descriptionForeground)",
								}}>
								The VS Code Language Model API allows you to run models provided by other VS Code extensions
								(including but not limited to GitHub Copilot). The easiest way to get started is to install the
								Copilot extension from the VS Marketplace and enabling Claude 4 Sonnet.
							</p>
						)}

						<p
							style={{
								fontSize: "12px",
								marginTop: "5px",
								color: "var(--vscode-errorForeground)",
								fontWeight: 500,
							}}>
							注意：这是一个非常实验性的集成，可能无法按预期工作。
						</p>
					</DropdownContainer>
				</div>
			)}

			{selectedProvider === "lmstudio" && (
				<div>
					<VSCodeTextField
						value={apiConfiguration?.lmStudioBaseUrl || ""}
						style={{ width: "100%" }}
						type="url"
						onInput={handleInputChange("lmStudioBaseUrl")}
						placeholder={"默认: http://localhost:1234"}>
						<span style={{ fontWeight: 500 }}>基础 URL（可选）</span>
					</VSCodeTextField>
					<VSCodeTextField
						value={apiConfiguration?.lmStudioModelId || ""}
						style={{ width: "100%" }}
						onInput={handleInputChange("lmStudioModelId")}
						placeholder={"例如 meta-llama-3.1-8b-instruct"}>
						<span style={{ fontWeight: 500 }}>模型 ID</span>
					</VSCodeTextField>
					{lmStudioModels.length > 0 && (
						<VSCodeRadioGroup
							value={
								lmStudioModels.includes(apiConfiguration?.lmStudioModelId || "")
									? apiConfiguration?.lmStudioModelId
									: ""
							}
							onChange={(e) => {
								const value = (e.target as HTMLInputElement)?.value
								// need to check value first since radio group returns empty string sometimes
								if (value) {
									handleInputChange("lmStudioModelId")({
										target: { value },
									})
								}
							}}>
							{lmStudioModels.map((model) => (
								<VSCodeRadio key={model} value={model} checked={apiConfiguration?.lmStudioModelId === model}>
									{model}
								</VSCodeRadio>
							))}
						</VSCodeRadioGroup>
					)}
					<p
						style={{
							fontSize: "12px",
							marginTop: "5px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						LM Studio allows you to run models locally on your computer. For instructions on how to get started, see
						their
						<VSCodeLink href="https://lmstudio.ai/docs" style={{ display: "inline", fontSize: "inherit" }}>
							quickstart guide.
						</VSCodeLink>
						You will also need to start LM Studio's{" "}
						<VSCodeLink
							href="https://lmstudio.ai/docs/basics/server"
							style={{ display: "inline", fontSize: "inherit" }}>
							local server
						</VSCodeLink>{" "}
						feature to use it with this extension.{" "}
						<span style={{ color: "var(--vscode-errorForeground)" }}>
							(<span style={{ fontWeight: 500 }}>Note:</span> Cline uses complex prompts and works best with Claude
							models. Less capable models may not work as expected.)
						</span>
					</p>
				</div>
			)}

			{selectedProvider === "litellm" && (
				<div>
					<VSCodeTextField
						value={apiConfiguration?.liteLlmBaseUrl || ""}
						style={{ width: "100%" }}
						type="url"
						onInput={handleInputChange("liteLlmBaseUrl")}
						placeholder={"默认: http://localhost:4000"}>
						<span style={{ fontWeight: 500 }}>基础 URL（可选）</span>
					</VSCodeTextField>
					<VSCodeTextField
						value={apiConfiguration?.liteLlmApiKey || ""}
						style={{ width: "100%" }}
						type="password"
						onInput={handleInputChange("liteLlmApiKey")}
						placeholder="默认: noop">
						<span style={{ fontWeight: 500 }}>API 密钥</span>
					</VSCodeTextField>
					<VSCodeTextField
						value={apiConfiguration?.liteLlmModelId || ""}
						style={{ width: "100%" }}
						onInput={handleInputChange("liteLlmModelId")}
						placeholder={"例如 anthropic/claude-sonnet-4-20250514"}>
						<span style={{ fontWeight: 500 }}>模型 ID</span>
					</VSCodeTextField>

					<div style={{ display: "flex", flexDirection: "column", marginTop: 10, marginBottom: 10 }}>
						{selectedModelInfo.supportsPromptCache && (
							<>
								<VSCodeCheckbox
									checked={apiConfiguration?.liteLlmUsePromptCache || false}
									onChange={(e: any) => {
										const isChecked = e.target.checked === true
										setApiConfiguration({
											...apiConfiguration,
											liteLlmUsePromptCache: isChecked,
										})
									}}
									style={{ fontWeight: 500, color: "var(--vscode-charts-green)" }}>
									Use prompt caching (GA)
								</VSCodeCheckbox>
								<p style={{ fontSize: "12px", marginTop: 3, color: "var(--vscode-charts-green)" }}>
									Prompt caching requires a supported provider and model
								</p>
							</>
						)}
					</div>

					<>
						<ThinkingBudgetSlider apiConfiguration={apiConfiguration} setApiConfiguration={setApiConfiguration} />
						<p
							style={{
								fontSize: "12px",
								marginTop: "5px",
								color: "var(--vscode-descriptionForeground)",
							}}>
							Extended thinking is available for models such as Sonnet-4, o3-mini, Deepseek R1, etc. More info on{" "}
							<VSCodeLink
								href="https://docs.litellm.ai/docs/reasoning_content"
								style={{ display: "inline", fontSize: "inherit" }}>
								thinking mode configuration
							</VSCodeLink>
						</p>
					</>

					<div
						style={{
							color: getAsVar(VSC_DESCRIPTION_FOREGROUND),
							display: "flex",
							margin: "10px 0",
							cursor: "pointer",
							alignItems: "center",
						}}
						onClick={() => setModelConfigurationSelected((val) => !val)}>
						<span
							className={`codicon ${modelConfigurationSelected ? "codicon-chevron-down" : "codicon-chevron-right"}`}
							style={{
								marginRight: "4px",
							}}></span>
						<span
							style={{
								fontWeight: 700,
								textTransform: "uppercase",
							}}>
							模型配置
					</span>
					</div>
					{modelConfigurationSelected && (
						<>
							<VSCodeCheckbox
								checked={!!apiConfiguration?.liteLlmModelInfo?.supportsImages}
								onChange={(e: any) => {
									const isChecked = e.target.checked === true
									const modelInfo = apiConfiguration?.liteLlmModelInfo
										? apiConfiguration.liteLlmModelInfo
										: { ...liteLlmModelInfoSaneDefaults }
									modelInfo.supportsImages = isChecked
									setApiConfiguration({
										...apiConfiguration,
										liteLlmModelInfo: modelInfo,
									})
								}}>
								Supports Images
							</VSCodeCheckbox>
							<div style={{ display: "flex", gap: 10, marginTop: "5px" }}>
								<VSCodeTextField
									value={
										apiConfiguration?.liteLlmModelInfo?.contextWindow
											? apiConfiguration.liteLlmModelInfo.contextWindow.toString()
											: liteLlmModelInfoSaneDefaults.contextWindow?.toString()
									}
									style={{ flex: 1 }}
									onInput={(input: any) => {
										const modelInfo = apiConfiguration?.liteLlmModelInfo
											? apiConfiguration.liteLlmModelInfo
											: { ...liteLlmModelInfoSaneDefaults }
										modelInfo.contextWindow = Number(input.target.value)
										setApiConfiguration({
											...apiConfiguration,
											liteLlmModelInfo: modelInfo,
										})
									}}>
									<span style={{ fontWeight: 500 }}>Context Window Size</span>
								</VSCodeTextField>
								<VSCodeTextField
									value={
										apiConfiguration?.liteLlmModelInfo?.maxTokens
											? apiConfiguration.liteLlmModelInfo.maxTokens.toString()
											: liteLlmModelInfoSaneDefaults.maxTokens?.toString()
									}
									style={{ flex: 1 }}
									onInput={(input: any) => {
										const modelInfo = apiConfiguration?.liteLlmModelInfo
											? apiConfiguration.liteLlmModelInfo
											: { ...liteLlmModelInfoSaneDefaults }
										modelInfo.maxTokens = input.target.value
										setApiConfiguration({
											...apiConfiguration,
											liteLlmModelInfo: modelInfo,
										})
									}}>
									<span style={{ fontWeight: 500 }}>Max Output Tokens</span>
								</VSCodeTextField>
							</div>
							<div style={{ display: "flex", gap: 10, marginTop: "5px" }}>
								<VSCodeTextField
									value={
										apiConfiguration?.liteLlmModelInfo?.temperature !== undefined
											? apiConfiguration.liteLlmModelInfo.temperature.toString()
											: liteLlmModelInfoSaneDefaults.temperature?.toString()
									}
									onInput={(input: any) => {
										const modelInfo = apiConfiguration?.liteLlmModelInfo
											? apiConfiguration.liteLlmModelInfo
											: { ...liteLlmModelInfoSaneDefaults }

										// Check if the input ends with a decimal point or has trailing zeros after decimal
										const value = input.target.value
										const shouldPreserveFormat =
											value.endsWith(".") || (value.includes(".") && value.endsWith("0"))

										modelInfo.temperature =
											value === ""
												? liteLlmModelInfoSaneDefaults.temperature
												: shouldPreserveFormat
													? value // Keep as string to preserve decimal format
													: parseFloat(value)

										setApiConfiguration({
											...apiConfiguration,
											liteLlmModelInfo: modelInfo,
										})
									}}>
									<span style={{ fontWeight: 500 }}>Temperature</span>
								</VSCodeTextField>
							</div>
						</>
					)}
					<p
						style={{
							fontSize: "12px",
							marginTop: "5px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						LiteLLM 提供统一接口来访问各种 LLM 提供商的模型。请参阅其{" "}
						<VSCodeLink href="https://docs.litellm.ai/docs/" style={{ display: "inline", fontSize: "inherit" }}>
							快速入门指南
						</VSCodeLink>{" "}
						了解更多信息。
					</p>
				</div>
			)}

			{selectedProvider === "ollama" && (
				<div>
					<VSCodeTextField
						value={apiConfiguration?.ollamaBaseUrl || ""}
						style={{ width: "100%" }}
						type="url"
						onInput={handleInputChange("ollamaBaseUrl")}
						placeholder={"默认: http://localhost:11434"}>
						<span style={{ fontWeight: 500 }}>基础 URL（可选）</span>
					</VSCodeTextField>

					{/* Model selection - use filterable picker */}
					<label htmlFor="ollama-model-selection">
						<span style={{ fontWeight: 500 }}>模型</span>
					</label>
					<OllamaModelPicker
						ollamaModels={ollamaModels}
						selectedModelId={apiConfiguration?.ollamaModelId || ""}
						onModelChange={(modelId) => {
							setApiConfiguration({
								...apiConfiguration,
								ollamaModelId: modelId,
							})
						}}
						placeholder={ollamaModels.length > 0 ? "搜索并选择模型..." : "例如 llama3.1"}
					/>

					{/* Show status message based on model availability */}
					{ollamaModels.length === 0 && (
						<p
							style={{
								fontSize: "12px",
								marginTop: "3px",
								color: "var(--vscode-descriptionForeground)",
								fontStyle: "italic",
							}}>
							Unablebto fetch models from le to fserver. Please ensure from a is running and Occessible, or enter
							thelmodel en manually above.ure Ollama is running and accessible, or enter
							the model ID manually above.
						</p>
					)}

					<VSCodeTextField
						value={apiConfiguration?.ollamaApiOptionsCtxNum || "32768"}
						style={{ width: "100%" }}
						onInput={handleInputChange("ollamaApiOptionsCtxNum")}
						placeholder={"e.g. 32768"}>
						<span style={{ fontWeight: 500 }}>Model Context Window</span>
					</VSCodeTextField>
					<p
						style={{
							fontSize: "12px",
							marginTop: "5px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						Ollama allows you to run models locally on your computer. For instructions on how to get started, see
						their{" "}
						<VSCodeLink
							href="https://github.com/ollama/ollama/blob/main/README.md"
							style={{ display: "inline", fontSize: "inherit" }}>
							quickstart guide.
						</VSCodeLink>{" "}
						<span style={{ color: "var(--vscode-errorForeground)" }}>
							(<span style={{ fontWeight: 500 }}>Note:</span> Cline uses complex prompts and works best with Claude
							models. Less capable models may not work as expected.)
						</span>
					</p>
				</div>
			)}

			{selectedProvider === "nebius" && (
				<div>
					<VSCodeTextField
						value={apiConfiguration?.nebiusApiKey || ""}
						style={{ width: "100%" }}
						type="password"
						onInput={handleInputChange("nebiusApiKey")}
						placeholder="输入 API 密钥...">
						<span style={{ fontWeight: 500 }}>Nebius API 密钥</span>
					</VSCodeTextField>
					<p
						style={{
							fontSize: "12px",
							marginTop: 3,
							color: "var(--vscode-descriptionForeground)",
						}}>
						This key is stored locally and only used to make API requests from this extension.{" "}
						{!apiConfiguration?.nebiusApiKey && (
							<VSCodeLink
								href="https://studio.nebius.com/settings/api-keys"
								style={{
									display: "inline",
									fontSize: "inherit",
								}}>
								You can get a Nebius API key by signing up here.{" "}
							</VSCodeLink>
						)}
						<span style={{ color: "var(--vscode-errorForeground)" }}>
							(<span style={{ fontWeight: 500 }}>Note:</span> Cline uses complex prompts and works best with Claude
							models. Less capable models may not work as expected.)
						</span>
					</p>
				</div>
			)}

			{apiErrorMessage && (
				<p
					style={{
						margin: "-10px 0 4px 0",
						fontSize: 12,
						color: "var(--vscode-errorForeground)",
					}}>
					{apiErrorMessage}
				</p>
			)}

			{selectedProvider === "xai" && (
				<div>
					<VSCodeTextField
						value={apiConfiguration?.xaiApiKey || ""}
						style={{ width: "100%" }}
						type="password"
						onInput={handleInputChange("xaiApiKey")}
						placeholder="输入 API 密钥...">
					<span style={{ fontWeight: 500 }}>X AI API 密钥</span>
				</VSCodeTextField>
				<p
					style={{
						fontSize: "12px",
						marginTop: 3,
						color: "var(--vscode-descriptionForeground)",
					}}>
					<span style={{ color: "var(--vscode-errorForeground)" }}>
						(<span style={{ fontWeight: 500 }}>注意：</span> Cline 使用复杂的提示词，与 Claude 模型配合使用效果最佳。功能较弱的模型可能无法按预期工作。)
					</span>
					此密钥在本地存储，仅用于从此扩展发起 API 请求。
					{!apiConfiguration?.xaiApiKey && (
						<VSCodeLink href="https://x.ai" style={{ display: "inline", fontSize: "inherit" }}>
							您可以在此注册获取 X AI API 密钥。
						</VSCodeLink>
						)}
					</p>
				</div>
			)}

			{selectedProvider === "cerebras" && (
				<div>
					<VSCodeTextField
						value={apiConfiguration?.cerebrasApiKey || ""}
						style={{ width: "100%" }}
						type="password"
						onInput={handleInputChange("cerebrasApiKey")}
						placeholder="输入 API 密钥...">
						<span style={{ fontWeight: 500 }}>Cerebras API 密钥</span>
					</VSCodeTextField>
					<p
						style={{
							fontSize: "12px",
							marginTop: 3,
							color: "var(--vscode-descriptionForeground)",
						}}>
						This key is stored locally and only used to make API requests from this extension.
						{!apiConfiguration?.cerebrasApiKey && (
							<VSCodeLink
								href="https://cloud.cerebras.ai/"
								style={{
									display: "inline",
									fontSize: "inherit",
								}}>
								You can get a Cerebras API key by signing up here.
							</VSCodeLink>
						)}
					</p>
				</div>
			)}

			{selectedProvider === "sapaicore" && (
				<div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
					<VSCodeTextField
						value={apiConfiguration?.sapAiCoreClientId || ""}
						style={{ width: "100%" }}
						type="password"
						onInput={handleInputChange("sapAiCoreClientId")}
						placeholder="输入 AI Core 客户端 ID...">
					<span style={{ fontWeight: 500 }}>AI Core 客户端 ID</span>
				</VSCodeTextField>
				{apiConfiguration?.sapAiCoreClientId && (
					<p style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)" }}>
						客户端 ID 已设置。如需更改，请重新输入值。
					</p>
				)}
				<VSCodeTextField
					value={apiConfiguration?.sapAiCoreClientSecret ? "********" : ""}
					style={{ width: "100%" }}
					type="password"
					onInput={handleInputChange("sapAiCoreClientSecret")}
					placeholder="输入 AI Core 客户端密钥...">
					<span style={{ fontWeight: 500 }}>AI Core 客户端密钥</span>
				</VSCodeTextField>
				{apiConfiguration?.sapAiCoreClientSecret && (
					<p style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)" }}>
						客户端密钥已设置。如需更改，请重新输入值。
					</p>
				)}
				<VSCodeTextField
					value={apiConfiguration?.sapAiCoreBaseUrl || ""}
					style={{ width: "100%" }}
					onInput={handleInputChange("sapAiCoreBaseUrl")}
					placeholder="输入 AI Core 基础 URL...">
					<span style={{ fontWeight: 500 }}>AI Core 基础 URL</span>
				</VSCodeTextField>
				<VSCodeTextField
					value={apiConfiguration?.sapAiCoreTokenUrl || ""}
					style={{ width: "100%" }}
					onInput={handleInputChange("sapAiCoreTokenUrl")}
					placeholder="输入 AI Core 认证 URL...">
					<span style={{ fontWeight: 500 }}>AI Core 认证 URL</span>
				</VSCodeTextField>
				<VSCodeTextField
					value={apiConfiguration?.sapAiResourceGroup || ""}
					style={{ width: "100%" }}
					onInput={handleInputChange("sapAiResourceGroup")}
					placeholder="输入 AI Core 资源组...">
					<span style={{ fontWeight: 500 }}>AI Core 资源组</span>
				</VSCodeTextField>
				<p
					style={{
						fontSize: "12px",
						marginTop: "5px",
						color: "var(--vscode-descriptionForeground)",
					}}>
					这些凭证在本地存储，仅用于从此扩展发起 API 请求。
					<VSCodeLink
						href="https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/access-sap-ai-core-via-api"
						style={{ display: "inline" }}>
						您可以在此找到有关 SAP AI Core API 访问的更多信息。
					</VSCodeLink>
					</p>
				</div>
			)}

			{apiErrorMessage && (
				<p
					style={{
						margin: "-10px 0 4px 0",
						fontSize: 12,
						color: "var(--vscode-errorForeground)",
					}}>
					{apiErrorMessage}
				</p>
			)}

			{selectedProvider === "ollama" && showModelOptions && (
				<>
					<VSCodeTextField
						value={apiConfiguration?.requestTimeoutMs ? apiConfiguration.requestTimeoutMs.toString() : "30000"}
						style={{ width: "100%" }}
						onInput={(e: any) => {
							const value = e.target.value
							// Convert to number, with validation
							const numValue = parseInt(value, 10)
							if (!isNaN(numValue) && numValue > 0) {
								setApiConfiguration({
									...apiConfiguration,
									requestTimeoutMs: numValue,
								})
							}
						}}
						placeholder="默认: 30000（30 秒）">
						<span style={{ fontWeight: 500 }}>Request Timeout (ms)Timeout (ms)Timeout (ms)</span>
					</VSCodeTextField>
					<p style={{ fontSize: "12px", marginTop: 3, color: "var(--vscode-descriptionForeground)" }}>
						Maximum time in milliseconds to wait for API responses before timing out.
					</p>
				</>
			)}

			{selectedProvider === "cline" && showModelOptions && (
				<>
					<VSCodeCheckbox
						style={{ marginTop: -10 }}
						checked={providerSortingSelected}
						onChange={(e: any) => {
							const isChecked = e.target.checked === true
							setProviderSortingSelected(isChecked)
							if (!isChecked) {
								setApiConfiguration({
									...apiConfiguration,
									openRouterProviderSorting: "",
								})
							}
						}}>
						Sort underlying provider routing
					</VSCodeCheckbox>

					{providerSortingSelected && (
						<div style={{ marginBottom: -6 }}>
							<DropdownContainer className="dropdown-container" zIndex={OPENROUTER_MODEL_PICKER_Z_INDEX + 1}>
								<VSCodeDropdown
									style={{ width: "100%", marginTop: 3 }}
									value={apiConfiguration?.openRouterProviderSorting}
									onChange={(e: any) => {
										setApiConfiguration({
											...apiConfiguration,
											openRouterProviderSorting: e.target.value,
										})
									}}>
									<VSCodeOption value="">Default</VSCodeOption>
									<VSCodeOption value="price">Price</VSCodeOption>
									<VSCodeOption value="throughput">Throughput</VSCodeOption>
									<VSCodeOption value="latency">Latency</VSCodeOption>
								</VSCodeDropdown>
							</DropdownContainer>
							<p style={{ fontSize: "12px", marginTop: 3, color: "var(--vscode-descriptionForeground)" }}>
								{!apiConfiguration?.openRouterProviderSorting &&
									"Default behavior is to load balance requests across providers (like AWS, Google Vertex, Anthropic), prioritizing price while considering provider uptime"}
								{apiConfiguration?.openRouterProviderSorting === "price" &&
									"Sort providers by price, prioritizing the lowest cost provider"}
								{apiConfiguration?.openRouterProviderSorting === "throughput" &&
									"Sort providers by throughput, prioritizing the provider with the highest throughput (may increase cost)"}
								{apiConfiguration?.openRouterProviderSorting === "latency" &&
									"Sort providers by response time, prioritizing the provider with the lowest latency"}
							</p>
						</div>
					)}
				</>
			)}

			{selectedProvider !== "openrouter" &&
				selectedProvider !== "cline" &&
				selectedProvider !== "anthropic" &&
				selectedProvider !== "asksage" &&
				selectedProvider !== "openai" &&
				selectedProvider !== "ollama" &&
				selectedProvider !== "lmstudio" &&
				selectedProvider !== "vscode-lm" &&
				selectedProvider !== "litellm" &&
				selectedProvider !== "requesty" &&
				selectedProvider !== "bedrock" &&
				selectedProvider !== "mistral" &&
				selectedProvider !== "deepseek" &&
				selectedProvider !== "sambanova" &&
				selectedProvider !== "openai-native" &&
				selectedProvider !== "gemini" &&
				selectedProvider !== "gemini-cli" &&
				showModelOptions && (
					<>
						<DropdownContainer zIndex={DROPDOWN_Z_INDEX - 2} className="dropdown-container">
							<label htmlFor="model-id">
								<span style={{ fontWeight: 500 }}>模型</span>
							</label>
							{selectedProvider === "claude-code" && createDropdown(claudeCodeModels)}
							{selectedProvider === "vertex" &&
								createDropdown(apiConfiguration?.vertexRegion === "global" ? vertexGlobalModels : vertexModels)}
							{selectedProvider === "qwen" &&
								createDropdown(
									apiConfiguration?.qwenApiLine === "china" ? mainlandQwenModels : internationalQwenModels,
								)}
							{selectedProvider === "doubao" && createDropdown(doubaoModels)}
							{selectedProvider === "xai" && createDropdown(xaiModels)}
							{selectedProvider === "cerebras" && createDropdown(cerebrasModels)}
							{selectedProvider === "nebius" && createDropdown(nebiusModels)}
							{selectedProvider === "sapaicore" && createDropdown(sapAiCoreModels)}
						</DropdownContainer>

						{SUPPORTED_THINKING_MODELS[selectedProvider]?.includes(selectedModelId) && (
							<ThinkingBudgetSlider
								apiConfiguration={apiConfiguration}
								setApiConfiguration={setApiConfiguration}
								maxBudget={selectedModelInfo.thinkingConfig?.maxBudget}
							/>
						)}

						{selectedProvider === "xai" && selectedModelId.includes("3-mini") && (
							<>
								<VSCodeCheckbox
									style={{ marginTop: 0 }}
									checked={reasoningEffortSelected}
									onChange={(e: any) => {
										const isChecked = e.target.checked === true
										setReasoningEffortSelected(isChecked)
										if (!isChecked) {
											setApiConfiguration({
												...apiConfiguration,
												reasoningEffort: "",
											})
										}
									}}>
									Modify reasoning effort
								</VSCodeCheckbox>

								{reasoningEffortSelected && (
									<div>
										<label htmlFor="reasoning-effort-dropdown">
											<span style={{}}>Reasoning Effort</span>
										</label>
										<DropdownContainer className="dropdown-container" zIndex={DROPDOWN_Z_INDEX - 100}>
											<VSCodeDropdown
												id="reasoning-effort-dropdown"
												style={{ width: "100%", marginTop: 3 }}
												value={apiConfiguration?.reasoningEffort || "high"}
												onChange={(e: any) => {
													setApiConfiguration({
														...apiConfiguration,
														reasoningEffort: e.target.value,
													})
												}}>
												<VSCodeOption value="low">low</VSCodeOption>
												<VSCodeOption value="high">high</VSCodeOption>
											</VSCodeDropdown>
										</DropdownContainer>
										<p
											style={{
												fontSize: "12px",
												marginTop: 3,
												marginBottom: 0,
												color: "var(--vscode-descriptionForeground)",
											}}>
											高强度可能产生更全面的分析，但耗时更长且消耗更多 tokens。
										</p>
									</div>
								)}
							</>
						)}
						<ModelInfoView
							selectedModelId={selectedModelId}
							modelInfo={selectedModelInfo}
							isDescriptionExpanded={isDescriptionExpanded}
							setIsDescriptionExpanded={setIsDescriptionExpanded}
							isPopup={isPopup}
						/>
					</>
				)}

			{selectedProvider === "cline" && showModelOptions && <OpenRouterModelPicker isPopup={isPopup} />}
			{selectedProvider === "requesty" && showModelOptions && <RequestyModelPicker isPopup={isPopup} />}

			{modelIdErrorMessage && (
				<p
					style={{
						margin: "-10px 0 4px 0",
						fontSize: 12,
						color: "var(--vscode-errorForeground)",
					}}>
					{modelIdErrorMessage}
				</p>
			)}
		</div>
	)
}

// Returns an array of formatted tier strings
const formatTiers = (
	tiers: ModelInfo["tiers"],
	priceType: "inputPrice" | "outputPrice" | "cacheReadsPrice" | "cacheWritesPrice",
): JSX.Element[] => {
	if (!tiers || tiers.length === 0) {
		return []
	}

	return tiers
		.map((tier, index, arr) => {
			const prevLimit = index > 0 ? arr[index - 1].contextWindow : 0
			const price = tier[priceType]

			if (price === undefined) return null

			return (
				<span style={{ paddingLeft: "15px" }} key={index}>
					{formatPrice(price)}/百万 tokens (
				{tier.contextWindow === Number.POSITIVE_INFINITY ? (
					<span>
						{">"} {prevLimit.toLocaleString()}
					</span>
				) : (
					<span>
						{"<="} {tier.contextWindow.toLocaleString()}
					</span>
				)}
				{" tokens)"}
					{index < arr.length - 1 && <br />}
				</span>
			)
		})
		.filter((element): element is JSX.Element => element !== null)
}

export const ModelInfoView = ({
	selectedModelId,
	modelInfo,
	isDescriptionExpanded,
	setIsDescriptionExpanded,
	isPopup,
}: {
	selectedModelId: string
	modelInfo: ModelInfo
	isDescriptionExpanded: boolean
	setIsDescriptionExpanded: (isExpanded: boolean) => void
	isPopup?: boolean
}) => {
	const isGemini = Object.keys(geminiModels).includes(selectedModelId)
	const hasThinkingConfig = !!modelInfo.thinkingConfig
	const hasTiers = !!modelInfo.tiers && modelInfo.tiers.length > 0

	// Create elements for input pricing
	const inputPriceElement = hasTiers ? (
		<Fragment key="inputPriceTiers">
			<span style={{ fontWeight: 500 }}>输入价格：</span>
			<br />
			{formatTiers(modelInfo.tiers, "inputPrice")}
		</Fragment>
	) : modelInfo.inputPrice !== undefined && modelInfo.inputPrice > 0 ? (
		<span key="inputPrice">
			<span style={{ fontWeight: 500 }}>输入价格：</span> {formatPrice(modelInfo.inputPrice)}/百万 tokens
		</span>
	) : null

	// --- Output Price Logic ---
	let outputPriceElement = null
	if (hasThinkingConfig && modelInfo.outputPrice !== undefined && modelInfo.thinkingConfig?.outputPrice !== undefined) {
		// Display both standard and thinking budget prices
		outputPriceElement = (
			<Fragment key="outputPriceConditional">
			<span style={{ fontWeight: 500 }}>输出价格（标准）：</span> {formatPrice(modelInfo.outputPrice)}/百万
			tokens
			<br />
			<span style={{ fontWeight: 500 }}>输出价格（思考预算 &gt; 0）：</span>{" "}
			{formatPrice(modelInfo.thinkingConfig.outputPrice)}/百万 tokens
		</Fragment>
		)
	} else if (hasTiers) {
		// Display tiered output pricing
		outputPriceElement = (
			<Fragment key="outputPriceTiers">
			<span style={{ fontWeight: 500 }}>输出价格：</span>
			<span style={{ fontStyle: "italic" }}> （基于输入 tokens）</span>
			<br />
			{formatTiers(modelInfo.tiers, "outputPrice")}
		</Fragment>
		)
	} else if (modelInfo.outputPrice !== undefined && modelInfo.outputPrice > 0) {
		// Display single standard output price
		outputPriceElement = (
			<span key="outputPrice">
			<span style={{ fontWeight: 500 }}>输出价格：</span> {formatPrice(modelInfo.outputPrice)}/百万 tokens
		</span>
		)
	}
	// --- End Output Price Logic ---

	const infoItems = [
		modelInfo.description && (
			<ModelDescriptionMarkdown
				key="description"
				markdown={modelInfo.description}
				isExpanded={isDescriptionExpanded}
				setIsExpanded={setIsDescriptionExpanded}
				isPopup={isPopup}
			/>
		),
		<ModelInfoSupportsItem
			key="supportsImages"
			isSupported={modelInfo.supportsImages ?? false}
			supportsLabel="支持图像"
			doesNotSupportLabel="不支持图像"
		/>,
		<ModelInfoSupportsItem
			key="supportsBrowserUse"
			isSupported={modelInfo.supportsImages ?? false} // cline browser tool uses image recognition for navigation (requires model image support).
			supportsLabel="支持浏览器使用"
			doesNotSupportLabel="不支持浏览器使用"
		/>,
		!isGemini && (
			<ModelInfoSupportsItem
				key="supportsPromptCache"
				isSupported={modelInfo.supportsPromptCache}
				supportsLabel="支持提示缓存"
				doesNotSupportLabel="不支持提示缓存"
			/>
		),
		modelInfo.maxTokens !== undefined && modelInfo.maxTokens > 0 && (
			<span key="maxTokens">
				<span style={{ fontWeight: 500 }}>最大输出：</span> {modelInfo.maxTokens?.toLocaleString()} tokens
			</span>
		),
		inputPriceElement, // Add the generated input price block
		modelInfo.supportsPromptCache && modelInfo.cacheWritesPrice && (
			<span key="cacheWritesPrice">
				<span style={{ fontWeight: 500 }}>缓存写入价格：</span> {formatPrice(modelInfo.cacheWritesPrice || 0)}
				/百万 tokens
			</span>
		),
		modelInfo.supportsPromptCache && modelInfo.cacheReadsPrice && (
			<span key="cacheReadsPrice">
				<span style={{ fontWeight: 500 }}>缓存读取价格：</span> {formatPrice(modelInfo.cacheReadsPrice || 0)}/百万
				tokens
			</span>
		),
		outputPriceElement, // Add the generated output price block
		isGemini && (
			<span key="geminiInfo" style={{ fontStyle: "italic" }}>
			* 每分钟最多免费 {selectedModelId && selectedModelId.includes("flash") ? "15" : "2"} 次请求。超过后，
			计费取决于提示大小。{" "}
			<VSCodeLink href="https://ai.google.dev/pricing" style={{ display: "inline", fontSize: "inherit" }}>
				了解更多信息，请参阅定价详情。
			</VSCodeLink>
		</span>
		),
	].filter(Boolean)

	return (
		<p
			style={{
				fontSize: "12px",
				marginTop: "2px",
				color: "var(--vscode-descriptionForeground)",
			}}>
			{infoItems.map((item, index) => (
				<Fragment key={index}>
					{item}
					{index < infoItems.length - 1 && <br />}
				</Fragment>
			))}
		</p>
	)
}

const ModelInfoSupportsItem = ({
	isSupported,
	supportsLabel,
	doesNotSupportLabel,
}: {
	isSupported: boolean
	supportsLabel: string
	doesNotSupportLabel: string
}) => (
	<span
		style={{
			fontWeight: 500,
			color: isSupported ? "var(--vscode-charts-green)" : "var(--vscode-errorForeground)",
		}}>
		<i
			className={`codicon codicon-${isSupported ? "check" : "x"}`}
			style={{
				marginRight: 4,
				marginBottom: isSupported ? 1 : -1,
				fontSize: isSupported ? 11 : 13,
				fontWeight: 700,
				display: "inline-block",
				verticalAlign: "bottom",
			}}></i>
		{isSupported ? supportsLabel : doesNotSupportLabel}
	</span>
)

export default memo(ApiOptions)
