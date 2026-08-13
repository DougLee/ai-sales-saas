import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { env } from './env.js'
import { inferProviderFromConfig } from './provider-registry.js'

const CONFIG_PATH = join(process.cwd(), 'config', 'ai-runtime.json')

export interface AIConfig {
  provider?: string
  openaiApiKey?: string
  openaiBaseUrl?: string
  modelName?: string
  bingSearchApiKey?: string
  tavilyApiKey?: string
  embeddingModelName?: string
  embeddingDimension?: number
  embeddingUseSameCredentials?: boolean
  embeddingBaseUrl?: string
  embeddingApiKey?: string
  senseVoiceApiKey?: string
  senseVoiceBaseUrl?: string
}

function loadConfig(): AIConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, 'utf-8')
      return JSON.parse(raw) as AIConfig
    }
  } catch {
    // ignore
  }
  return {}
}

function saveConfig(config: AIConfig) {
  const dir = join(process.cwd(), 'config')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
}

let runtimeConfig: AIConfig = loadConfig()

export function getAIConfig(): Required<AIConfig> {
  const baseUrl = runtimeConfig.openaiBaseUrl ?? env.OPENAI_BASE_URL ?? ''
  const modelName = runtimeConfig.modelName ?? 'gpt-4o-mini'
  const provider = runtimeConfig.provider || inferProviderFromConfig(baseUrl, modelName)

  return {
    provider,
    openaiApiKey: runtimeConfig.openaiApiKey ?? env.OPENAI_API_KEY ?? '',
    openaiBaseUrl: baseUrl,
    modelName,
    bingSearchApiKey: runtimeConfig.bingSearchApiKey ?? env.BING_SEARCH_API_KEY ?? '',
    tavilyApiKey: runtimeConfig.tavilyApiKey ?? env.TAVILY_API_KEY ?? '',
    embeddingModelName: runtimeConfig.embeddingModelName ?? 'text-embedding-3-small',
    embeddingDimension: runtimeConfig.embeddingDimension ?? 1536,
    embeddingUseSameCredentials: runtimeConfig.embeddingUseSameCredentials ?? true,
    embeddingBaseUrl: runtimeConfig.embeddingBaseUrl ?? '',
    embeddingApiKey: runtimeConfig.embeddingApiKey ?? '',
    senseVoiceApiKey: runtimeConfig.senseVoiceApiKey ?? env.SENSEVOICE_API_KEY ?? '',
    senseVoiceBaseUrl: runtimeConfig.senseVoiceBaseUrl ?? '',
  }
}

export function updateAIConfig(config: Partial<AIConfig>) {
  runtimeConfig = { ...runtimeConfig, ...config }
  saveConfig(runtimeConfig)
  return runtimeConfig
}
