import { generateText } from 'ai'
import { createModel } from '../config/model-provider.js'
import { llmConcurrencyLimiter } from '../infra/concurrency-limiter.js'

const EXTRACTION_PROMPT = `你是 AI 销售管理系统的文档分析助手。
请分析以下文档内容，提取结构化信息，返回严格 JSON 格式。

要求：
1. summary: 文档核心内容摘要，200字以内
2. entities: 识别到的实体列表（客户公司、项目机会、关键联系人）
   - name: 实体名称
   - type: 实体类型（COMPANY/PROJECT/CONTACT/OPPORTUNITY）
   - region?: 地区
   - level?: 级别/规模
   - industry?: 行业
   - contacts?: 关联联系人列表 [{ name, position?, phone?, email?, company?, department? }]
3. enrollPreview: 可导入 CRM 的数据预览
   - accounts: 目标客户池数据 [{ name, industry?, region?, level?, address?, contactPerson?, contactPhone?, notes? }]
   - leads: 线索数据 [{ name, industry?, contactName?, contactPhone?, contactPosition?, contactEmail?, source?, notes? }]
   - projects: 商机数据 [{ name, industry?, amount?, milestone?, urgency?, notes? }]
   - contacts: 联系人数据 [{ name, position?, department?, company?, phone?, email?, wechat?, decisionRole? }]

注意：
- 只提取文档中明确提到的信息，不要编造
- 如果某类数据不存在，返回空数组
- 所有字段都是可选的，不要填充默认值
- 返回格式必须是合法的 JSON，不要包含 markdown 代码块标记

文档内容：
---
{{CONTENT}}
---`

export interface AnalysisResult {
  fileName: string
  analysis: {
    summary?: string
    entities?: Array<{
      name: string
      type: string
      region?: string
      level?: string
      industry?: string
      contacts?: Array<{
        name: string
        position?: string
        phone?: string
        email?: string
        company?: string
        department?: string
      }>
    }>
    enrollPreview?: {
      accounts?: Array<Record<string, unknown>>
      leads?: Array<Record<string, unknown>>
      projects?: Array<Record<string, unknown>>
      contacts?: Array<Record<string, unknown>>
    }
  }
}

export async function analyzeDocument(fileName: string, content: string, userId?: string): Promise<AnalysisResult> {
  const prompt = EXTRACTION_PROMPT.replace('{{CONTENT}}', content)

  const result = await llmConcurrencyLimiter.run(userId || 'anonymous', () =>
    generateText({
      model: createModel() as unknown as Parameters<typeof generateText>[0]['model'],
      prompt,
      temperature: 0.2,
      maxOutputTokens: 4000,
    }),
  )

  let analysis: AnalysisResult['analysis'] = { summary: '', entities: [], enrollPreview: { accounts: [], leads: [], projects: [], contacts: [] } }

  try {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/)
    const jsonStr = jsonMatch ? jsonMatch[0] : result.text
    const parsed = JSON.parse(jsonStr) as Partial<AnalysisResult['analysis']>
    analysis = {
      summary: parsed.summary || '',
      entities: parsed.entities || [],
      enrollPreview: parsed.enrollPreview || { accounts: [], leads: [], projects: [], contacts: [] },
    }
  } catch {
    // 解析失败时返回原始文本作为摘要
    analysis.summary = result.text.slice(0, 500)
  }

  return { fileName, analysis }
}
