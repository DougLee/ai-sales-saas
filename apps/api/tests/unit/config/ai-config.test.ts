import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFs = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

vi.mock('node:fs', () => mockFs)

vi.mock('../../../src/config/env.js', () => ({
  env: {
    OPENAI_API_KEY: 'env-key',
    OPENAI_BASE_URL: 'https://env.openai.com/v1',
    BING_SEARCH_API_KEY: 'bing-env',
    TAVILY_API_KEY: 'tavily-env',
    SENSEVOICE_API_KEY: 'sense-env',
  },
}))

vi.mock('../../../src/config/provider-registry.js', () => ({
  inferProviderFromConfig: vi.fn().mockReturnValue('inferred-provider'),
}))

describe('ai-config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  async function loadModule() {
    return import('../../../src/config/ai-config.js')
  }

  it('returns defaults when no config', async () => {
    mockFs.existsSync.mockReturnValue(false)
    const { getAIConfig } = await loadModule()
    const config = getAIConfig()
    expect(config.modelName).toBe('gpt-4o-mini')
    expect(config.embeddingModelName).toBe('text-embedding-3-small')
    expect(config.embeddingDimension).toBe(1536)
    expect(config.embeddingUseSameCredentials).toBe(true)
  })

  it('loads config from file', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ modelName: 'gpt-4o', provider: 'openai' }))
    const { getAIConfig } = await loadModule()
    const config = getAIConfig()
    expect(config.modelName).toBe('gpt-4o')
    expect(config.provider).toBe('openai')
  })

  it('falls back to env variables', async () => {
    mockFs.existsSync.mockReturnValue(false)
    const { getAIConfig } = await loadModule()
    const config = getAIConfig()
    expect(config.openaiApiKey).toBe('env-key')
    expect(config.openaiBaseUrl).toBe('https://env.openai.com/v1')
  })

  it('updates config and persists to file', async () => {
    mockFs.existsSync.mockReturnValue(false)
    const { getAIConfig, updateAIConfig } = await loadModule()
    updateAIConfig({ modelName: 'custom-model' })
    const config = getAIConfig()
    expect(config.modelName).toBe('custom-model')
    expect(mockFs.writeFileSync).toHaveBeenCalled()
  })

  it('creates config directory if missing', async () => {
    mockFs.existsSync.mockReturnValue(false)
    const { updateAIConfig } = await loadModule()
    updateAIConfig({ provider: 'openai' })
    expect(mockFs.mkdirSync).toHaveBeenCalled()
  })

  it('ignores malformed config file', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('not-json')
    const { getAIConfig } = await loadModule()
    const config = getAIConfig()
    expect(config.modelName).toBe('gpt-4o-mini')
  })
})
