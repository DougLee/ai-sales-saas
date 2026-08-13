import { getAIConfig } from '../config/ai-config.js'

export interface EmbeddingResult {
  embedding: number[]
  index: number
}

function getEmbeddingCredentials() {
  const config = getAIConfig()
  if (config.embeddingUseSameCredentials) {
    return {
      baseURL: config.openaiBaseUrl,
      apiKey: config.openaiApiKey,
      modelName: config.embeddingModelName,
      dimension: config.embeddingDimension,
    }
  }
  return {
    baseURL: config.embeddingBaseUrl || config.openaiBaseUrl,
    apiKey: config.embeddingApiKey || config.openaiApiKey,
    modelName: config.embeddingModelName,
    dimension: config.embeddingDimension,
  }
}

/**
 * 调用 Embedding 接口将文本转换为向量
 * @param inputs 文本数组（已切分好的 chunks）
 * @returns 向量数组，顺序与输入一致
 */
export async function embedTexts(inputs: string[]): Promise<EmbeddingResult[]> {
  if (inputs.length === 0) return []

  const { baseURL, apiKey, modelName } = getEmbeddingCredentials()
  const endpoint = baseURL ? `${baseURL.replace(/\/$/, '')}/embeddings` : 'https://api.openai.com/v1/embeddings'

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      input: inputs,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Embedding API error (${res.status}): ${text}`)
  }

  const data = await res.json() as {
    data?: Array<{ embedding: number[]; index: number }>
    error?: { message: string }
  }

  if (data.error) {
    throw new Error(`Embedding API error: ${data.error.message}`)
  }

  if (!data.data || data.data.length === 0) {
    throw new Error('Embedding API returned empty data')
  }

  // 按 index 排序确保顺序一致
  return data.data
    .map((d) => ({ embedding: d.embedding, index: d.index }))
    .sort((a, b) => a.index - b.index)
}

/**
 * 测试 Embedding 连接是否可用
 */
export async function testEmbeddingConnection(): Promise<{ success: boolean; message: string; dimension?: number }> {
  try {
    const { modelName } = getEmbeddingCredentials()
    const results = await embedTexts(['测试连接'])
    if (results[0]?.embedding.length) {
      return {
        success: true,
        message: `连接成功，模型：${modelName}，维度：${results[0].embedding.length}`,
        dimension: results[0].embedding.length,
      }
    }
    return { success: false, message: '返回空向量' }
  } catch (err) {
    return { success: false, message: (err as Error).message }
  }
}
