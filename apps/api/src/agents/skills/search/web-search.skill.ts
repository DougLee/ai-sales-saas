import { z } from 'zod'
import { getAIConfig } from '../../../config/ai-config.js'
import type { SkillDefinition } from '../skill-types.js'

interface SearchResult {
  title: string
  link: string
  snippet: string
}

async function bingSearch(query: string, apiKey: string, num = 5): Promise<SearchResult[]> {
  const res = await fetch(
    `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${Math.min(num, 10)}&mkt=zh-CN`,
    {
      headers: { 'Ocp-Apim-Subscription-Key': apiKey },
    },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Bing Search API error ${res.status}: ${text.slice(0, 200)}`)
  }

  const json = (await res.json()) as {
    webPages?: { value?: Array<{ name: string; url: string; snippet?: string }> }
    error?: { message: string }
  }

  if (json.error) {
    throw new Error(`Bing Search API error: ${json.error.message}`)
  }

  return (json.webPages?.value || []).map((item) => ({
    title: item.name,
    link: item.url,
    snippet: item.snippet || '',
  }))
}

async function tavilySearch(query: string, apiKey: string, num = 5): Promise<SearchResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: Math.min(num, 10),
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Tavily API error ${res.status}: ${text.slice(0, 200)}`)
  }

  const json = (await res.json()) as {
    results?: Array<{ title: string; url: string; content: string }>
    error?: string
  }

  if (json.error) {
    throw new Error(`Tavily API error: ${json.error}`)
  }

  return (json.results || []).map((item) => ({
    title: item.title,
    link: item.url,
    snippet: item.content || '',
  }))
}

const WebSearchInputSchema = z.object({
  query: z.string().min(1).describe('搜索关键词'),
  num: z.number().min(1).max(10).optional().describe('返回结果数量，默认5条'),
})

const WebSearchOutputSchema = z.object({
  query: z.string(),
  count: z.number(),
  source: z.string(),
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      summary: z.string(),
    }),
  ),
})

export const webSearchSkill: SkillDefinition<
  z.infer<typeof WebSearchInputSchema>,
  z.infer<typeof WebSearchOutputSchema>
> = {
  id: 'web-search',
  name: '网络搜索',
  description:
    '检索互联网公开信息，补充实时外部数据。适用于客户背景调研、行业动态、竞品信息、地区客户名单等场景。优先使用 Tavily，其次 Bing。',
  category: 'search',
  readOnly: true,
  inputSchema: WebSearchInputSchema,
  outputSchema: WebSearchOutputSchema,
  execute: async ({ params }) => {
    const config = getAIConfig()
    const num = params.num ?? 5

    if (config.tavilyApiKey) {
      const results = await tavilySearch(params.query, config.tavilyApiKey, num)
      return {
        success: true,
        data: {
          query: params.query,
          count: results.length,
          source: 'tavily',
          results: results.map((r) => ({
            title: r.title,
            url: r.link,
            summary: r.snippet,
          })),
        },
      }
    }

    if (config.bingSearchApiKey) {
      const results = await bingSearch(params.query, config.bingSearchApiKey, num)
      return {
        success: true,
        data: {
          query: params.query,
          count: results.length,
          source: 'bing',
          results: results.map((r) => ({
            title: r.title,
            url: r.link,
            summary: r.snippet,
          })),
        },
      }
    }

    return {
      success: false,
      error: {
        code: 'SEARCH_NOT_CONFIGURED',
        message: '搜索引擎未配置。请在系统设置中配置 Tavily 或 Bing Search API Key。',
      },
    }
  },
}
