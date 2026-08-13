import { z } from 'zod'
import { generateText } from 'ai'
import { createModel } from '../../../config/model-provider.js'
import { llmConcurrencyLimiter } from '../../../infra/concurrency-limiter.js'
import type { SkillDefinition } from '../skill-types.js'

const VisitAnalysisInputSchema = z.object({
  visitId: z.string().min(1),
})

const VisitAnalysisOutputSchema = z.record(z.unknown())

export const visitAnalysisSkill: SkillDefinition<
  z.infer<typeof VisitAnalysisInputSchema>,
  z.infer<typeof VisitAnalysisOutputSchema>
> = {
  id: 'visit-analysis',
  name: '拜访分析',
  description: '分析拜访录音或拜访记录，提取决策链、里程碑进展、风险点和下一步行动建议',
  category: 'analysis',
  readOnly: false,
  inputSchema: VisitAnalysisInputSchema,
  outputSchema: VisitAnalysisOutputSchema,
  execute: async ({ params, context }) => {
    const prisma = context.prisma

    const visit = await prisma.visit.findUnique({
      where: { id: params.visitId },
      include: {
        project: {
          include: {
            company: true,
            contacts: { include: { contact: true } },
            visits: { take: 5, orderBy: { visitTime: 'desc' } },
          },
        },
      },
    })

    if (!visit) {
      return { success: false, error: { code: 'NOT_FOUND', message: '拜访记录不存在' } }
    }

    const content = visit.summary || visit.audioTranscript || ''
    if (!content.trim()) {
      return { success: false, error: { code: 'EMPTY_CONTENT', message: '拜访记录无内容可分析' } }
    }

    const project = visit.project
    const contextLines: string[] = []
    if (project) {
      contextLines.push(`项目: ${project.name}`)
      contextLines.push(`当前里程碑: M${project.milestone}`)
      if (project.company) contextLines.push(`客户: ${project.company.name}`)
      if (project.contacts?.length) {
        contextLines.push('已知联系人:')
        project.contacts.forEach((pc) => {
          const c = pc.contact
          contextLines.push(`  - ${c.name} (${c.position || '未知职位'}) [${pc.role || '未知角色'}]`)
        })
      }
    }

    const prompt = `请作为销售分析专家，基于以下拜访记录和项目背景进行深度分析。

【项目背景】
${contextLines.join('\n') || '无'}

【本次拜访内容】
${content}

请输出以下维度的分析结果（JSON格式）：
1. milestoneProgress: 里程碑进展判断
2. decisionChain: 决策链洞察（name, role, attitude, insight）
3. keyInfo: 关键信息（budget预算, timeline时间线, competitors竞品, painPoints痛点）
4. risks: 风险预警列表
5. nextActions: 下一步行动建议列表
6. sentiment: 整体情绪判断（积极/中性/消极）
7. leadSuggestion: 是否建议创建线索（true/false）
8. leadIntentLevel: 若建议创建线索，意向等级（高/中/低）
9. leadReason: 建议创建或不需要创建线索的理由（一句话）

只返回合法JSON，不要markdown代码块。`

    const { text } = await llmConcurrencyLimiter.run(context.userId, () =>
      generateText({
        model: createModel() as unknown as Parameters<typeof generateText>[0]['model'],
        prompt,
        temperature: 0.3,
        maxOutputTokens: 3000,
      }),
    )

    let analysis: Record<string, unknown> = {}
    try {
      const clean = text.replace(/^```json\s*|\s*```$/g, '').trim()
      analysis = JSON.parse(clean)
    } catch {
      analysis = { milestoneProgress: text.slice(0, 500) }
    }

    await prisma.visit.update({
      where: { id: params.visitId },
      data: { aiAnalysis: analysis as never },
    })

    return {
      success: true,
      data: {
        visitId: params.visitId,
        projectName: project?.name,
        analysis,
      },
    }
  },
}
