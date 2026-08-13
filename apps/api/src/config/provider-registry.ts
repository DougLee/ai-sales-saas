export interface ProviderPreset {
  id: string
  label: string
  description?: string
  recommendedBaseUrl: string
  recommendedModels: string[]
  capabilities: {
    streaming: boolean
    toolCalling: boolean
    jsonMode: boolean
  }
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'OpenAI 官方 API',
    recommendedBaseUrl: 'https://api.openai.com/v1',
    recommendedModels: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
    capabilities: { streaming: true, toolCalling: true, jsonMode: true },
  },
  {
    id: 'azure-openai',
    label: 'Azure OpenAI',
    description: '微软 Azure OpenAI 服务',
    recommendedBaseUrl: 'https://{your-resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version=2024-06-01',
    recommendedModels: ['gpt-4o', 'gpt-4o-mini'],
    capabilities: { streaming: true, toolCalling: true, jsonMode: true },
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    description: '深度求索官方 API',
    recommendedBaseUrl: 'https://api.deepseek.com/v1',
    recommendedModels: ['deepseek-chat', 'deepseek-reasoner'],
    capabilities: { streaming: true, toolCalling: false, jsonMode: true },
  },
  {
    id: 'siliconflow',
    label: '硅基流动 (SiliconFlow)',
    description: '国内聚合平台，支持多种开源模型',
    recommendedBaseUrl: 'https://api.siliconflow.cn/v1',
    recommendedModels: ['deepseek-ai/DeepSeek-V3.2', 'Qwen/Qwen2.5-72B-Instruct', 'meta-llama/Meta-Llama-3.1-70B-Instruct'],
    capabilities: { streaming: true, toolCalling: false, jsonMode: true },
  },
  {
    id: 'moonshot',
    label: 'Moonshot (月之暗面)',
    description: 'Kimi 官方 API',
    recommendedBaseUrl: 'https://api.moonshot.cn/v1',
    recommendedModels: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    capabilities: { streaming: true, toolCalling: true, jsonMode: true },
  },
  {
    id: 'zhipu',
    label: '智谱 AI (Zhipu)',
    description: 'GLM 系列模型',
    recommendedBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    recommendedModels: ['glm-4', 'glm-4-flash', 'glm-4-plus'],
    capabilities: { streaming: true, toolCalling: true, jsonMode: true },
  },
  {
    id: 'ollama',
    label: 'Ollama (本地)',
    description: '本地运行开源模型',
    recommendedBaseUrl: 'http://localhost:11434/v1',
    recommendedModels: ['llama3.1', 'qwen2.5', 'deepseek-coder-v2'],
    capabilities: { streaming: true, toolCalling: false, jsonMode: false },
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (本地)',
    description: 'LM Studio 本地服务器',
    recommendedBaseUrl: 'http://localhost:1234/v1',
    recommendedModels: ['local-model'],
    capabilities: { streaming: true, toolCalling: false, jsonMode: false },
  },
  {
    id: 'mlx',
    label: 'MLX (Apple Silicon 本地)',
    description: 'Apple Silicon 本地 MLX 推理',
    recommendedBaseUrl: 'http://127.0.0.1:8000/v1',
    recommendedModels: ['Qwen3.6-35B-A3B-UD-MLX-4bit'],
    capabilities: { streaming: true, toolCalling: false, jsonMode: false },
  },
  {
    id: 'vllm',
    label: 'vLLM (本地/自托管)',
    description: 'vLLM 高性能推理服务器',
    recommendedBaseUrl: 'http://localhost:8000/v1',
    recommendedModels: ['local-model'],
    capabilities: { streaming: true, toolCalling: false, jsonMode: false },
  },
  {
    id: 'custom',
    label: '自定义 (OpenAI 兼容)',
    description: '其他 OpenAI 兼容接口',
    recommendedBaseUrl: '',
    recommendedModels: [],
    capabilities: { streaming: true, toolCalling: false, jsonMode: false },
  },
]

export function findProviderPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id)
}

export function inferProviderFromConfig(baseUrl: string, modelName: string): string {
  const url = baseUrl.toLowerCase()
  const model = modelName.toLowerCase()

  if (url.includes('deepseek')) return 'deepseek'
  if (url.includes('siliconflow')) return 'siliconflow'
  if (url.includes('moonshot')) return 'moonshot'
  if (url.includes('bigmodel.cn') || url.includes('zhipu')) return 'zhipu'
  if (url.includes('azure')) return 'azure-openai'
  if (url.includes('openai.com')) return 'openai'
  if (url.includes('localhost:11434')) return 'ollama'
  if (url.includes('localhost:1234')) return 'lmstudio'
  if (url.includes('127.0.0.1:8000') || model.includes('mlx')) return 'mlx'
  if (url.includes('localhost:8000')) return 'vllm'
  if (url.includes('localhost') || url.includes('127.0.0.1')) return 'custom'

  return 'custom'
}

export function getProviderCapabilities(providerId: string) {
  const preset = findProviderPreset(providerId)
  if (preset) return preset.capabilities

  // 未知提供商：保守策略，默认不支持 toolCalling，支持 streaming
  return {
    streaming: true,
    toolCalling: false,
    jsonMode: false,
  }
}
