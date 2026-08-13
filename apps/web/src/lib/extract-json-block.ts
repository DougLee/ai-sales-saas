export interface ExtractResult {
  text: string
  json: unknown | null
  intent: string | null
}

export function extractJsonBlock(content: string): ExtractResult {
  // 1. 标准 markdown json 代码块
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/)
  if (jsonMatch) {
    try {
      const json = JSON.parse(jsonMatch[1].trim()) as Record<string, unknown>
      const intent = inferIntent(json)
      const text = content.replace(jsonMatch[0], '').trim()
      return { text, json, intent }
    } catch {
      // 解析失败，继续尝试其他模式
    }
  }

  // 2. 通用代码块（无 json 标记）
  const genericMatch = content.match(/```\s*([\s\S]*?)\s*```/)
  if (genericMatch) {
    try {
      const json = JSON.parse(genericMatch[1].trim()) as Record<string, unknown>
      if (json && typeof json === 'object' && !Array.isArray(json)) {
        const intent = inferIntent(json)
        const text = content.replace(genericMatch[0], '').trim()
        return { text, json, intent }
      }
    } catch { /* ignore */ }
  }

  // 3. 裸 JSON 对象（未被代码块包裹）
  const firstBrace = content.indexOf('{')
  const lastBrace = content.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      const candidate = content.slice(firstBrace, lastBrace + 1)
      const json = JSON.parse(candidate) as Record<string, unknown>
      if (json && typeof json === 'object' && Object.keys(json).length > 0) {
        const intent = inferIntent(json)
        const text = (content.slice(0, firstBrace) + content.slice(lastBrace + 1)).trim()
        return { text, json, intent }
      }
    } catch { /* ignore */ }
  }

  return { text: content, json: null, intent: null }
}

function inferIntent(json: Record<string, unknown>): string | null {
  const keys = Object.keys(json)
  if (keys.includes('people') && keys.includes('spinAssessment')) return 'visit_analysis'
  if (keys.includes('customerProfile') && keys.includes('decisionChain')) return 'background_research'
  if (keys.includes('pipelineOverview') && keys.includes('teamComparison')) return 'team_management'
  if (keys.includes('searchStrategy') && keys.includes('targetAccounts')) return 'territory_search'
  if (keys.includes('targetAnalysis') && keys.includes('touchPlan')) return 'territory_expansion'
  if (keys.includes('overview') && keys.includes('intentions')) return 'bidding_monitor'
  if (keys.includes('scoreOverview') && keys.includes('conversionRoadmap')) return 'lead_assessment'
  if (keys.includes('visitAgenda') && keys.includes('objectionLibrary')) return 'visit_preparation'
  if (keys.includes('illusionScore') && keys.includes('redFlags')) return 'illusion_detection'
  return null
}
