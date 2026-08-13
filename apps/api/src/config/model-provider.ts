import { createOpenAI } from '@ai-sdk/openai'
import { getAIConfig } from './ai-config.js'

export function createModel() {
  const config = getAIConfig()
  const provider = createOpenAI({
    apiKey: config.openaiApiKey || undefined,
    baseURL: config.openaiBaseUrl || undefined,
  })
  return provider.chat(config.modelName) as unknown as Parameters<typeof import('ai').generateText>[0]['model']
}
