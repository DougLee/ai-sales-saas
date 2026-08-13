import { z } from 'zod'
import type { SkillDefinition } from '../skill-types.js'

const BriefingQueryInputSchema = z.object({})

const BriefingQueryOutputSchema = z.record(z.unknown())

export const briefingQuerySkill: SkillDefinition<
  z.infer<typeof BriefingQueryInputSchema>,
  z.infer<typeof BriefingQueryOutputSchema>
> = {
  id: 'briefing-query',
  name: '今日简报',
  description: '获取当前用户的今日作战简报，包含优先动作、AI洞察、统计数据',
  category: 'query',
  readOnly: true,
  inputSchema: BriefingQueryInputSchema,
  outputSchema: BriefingQueryOutputSchema,
  execute: async ({ params: _params, context }) => {
    const { generateBriefing } = await import('../../workflows/briefing.js')
    const data = await generateBriefing(context.prisma, context.tenantId, context.userId)
    return { success: true, data }
  },
}
