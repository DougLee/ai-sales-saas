import { z } from 'zod'

export const HumanInfoSchema = z.object({
  dimensions: z.array(
    z.object({
      role: z.enum(['COACH', 'EVALUATOR', 'DECISION_MAKER']),
      trustIndicators: z.array(z.string()),
      attitudeTracking: z.boolean(),
    })
  ),
  extractionRules: z.array(z.string()),
})

export const SpinSchema = z.object({
  situation: z.object({
    prompt: z.string(),
    examples: z.array(z.string()),
  }),
  problem: z.object({
    prompt: z.string(),
    examples: z.array(z.string()),
  }),
  implication: z.object({
    prompt: z.string(),
    examples: z.array(z.string()),
  }),
  needPayoff: z.object({
    prompt: z.string(),
    examples: z.array(z.string()),
  }),
})

export const EvidenceRequirementSchema = z.object({
  type: z.string(),
  min: z.number().int().min(1).optional(),
  withinDays: z.number().int().min(1).optional(),
})

export const MilestoneGateRuleFieldSchema = z.object({
  path: z.string(),
  label: z.string(),
  validator: z.enum(['nonEmpty', 'arrayMinLength', 'stringMinLength']).optional(),
  params: z.object({ min: z.number().int().optional() }).optional(),
  evidence: z.array(EvidenceRequirementSchema).optional(),
})

export type MilestoneGateRuleField = z.infer<typeof MilestoneGateRuleFieldSchema>

export const MilestoneGateCompoundRuleSchema: z.ZodType<{
  operator: 'and' | 'or' | 'not'
  label: string
  rules: Array<MilestoneGateRuleField | MilestoneGateCompoundRule>
}> = z.lazy(() =>
  z.object({
    operator: z.enum(['and', 'or', 'not']),
    label: z.string(),
    rules: z.array(z.union([MilestoneGateRuleFieldSchema, MilestoneGateCompoundRuleSchema])),
  })
)

export type MilestoneGateCompoundRule = z.infer<typeof MilestoneGateCompoundRuleSchema>

export const MilestoneGateRuleSchema = z.object({
  fromStage: z.number().int(),
  requiredFields: z.array(z.union([MilestoneGateRuleFieldSchema, MilestoneGateCompoundRuleSchema])),
})

export type MilestoneGateRule = z.infer<typeof MilestoneGateRuleSchema>

export const MilestoneSchema = z.object({
  stages: z.array(
    z.object({
      stage: z.number().int(),
      name: z.string(),
      criteria: z.array(z.string()),
      evidenceRequired: z.array(z.string()),
    })
  ),
  gateRules: z.array(MilestoneGateRuleSchema).optional(),
})

export const SalesPlaybookSchema = z.object({
  stages: z.array(
    z.object({
      stage: z.number().int(),
      name: z.string(),
      keyActions: z.array(z.string()),
    })
  ),
})

export const DemandMiningSchema = z.object({
  levels: z.array(
    z.object({
      level: z.number().int(),
      name: z.string(),
      description: z.string(),
    })
  ),
  spinDimensions: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      purpose: z.string(),
    })
  ),
})

export const PersonalityAnalysisSchema = z.object({
  types: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      traits: z.string(),
      approach: z.string(),
    })
  ),
})

export const FollowUpSchema = z.object({
  rhythm: z.array(
    z.object({
      level: z.string(),
      frequency: z.string(),
      content: z.string(),
    })
  ),
})

export const MethodologyConfigSchema = z.discriminatedUnion('moduleType', [
  z.object({
    moduleType: z.literal('HUMAN_INFO'),
    configJson: HumanInfoSchema,
  }),
  z.object({
    moduleType: z.literal('SPIN'),
    configJson: SpinSchema,
  }),
  z.object({
    moduleType: z.literal('MILESTONE'),
    configJson: MilestoneSchema,
  }),
  z.object({
    moduleType: z.literal('SALES_PLAYBOOK'),
    configJson: SalesPlaybookSchema,
  }),
  z.object({
    moduleType: z.literal('DEMAND_MINING'),
    configJson: DemandMiningSchema,
  }),
  z.object({
    moduleType: z.literal('PERSONALITY_ANALYSIS'),
    configJson: PersonalityAnalysisSchema,
  }),
  z.object({
    moduleType: z.literal('FOLLOW_UP'),
    configJson: FollowUpSchema,
  }),
])

export function validateMethodologyConfig(raw: unknown) {
  return MethodologyConfigSchema.parse(raw)
}
