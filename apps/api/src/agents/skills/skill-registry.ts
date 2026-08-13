import type {
  SkillDefinition,
  SkillContext,
  SkillOutput,
} from './skill-types.js'

export class SkillRegistry {
  private skills = new Map<string, SkillDefinition>()

  register(skill: SkillDefinition<any, any>) {
    if (this.skills.has(skill.id)) {
      throw new Error(`Skill ${skill.id} already registered`)
    }
    this.skills.set(skill.id, skill)
  }

  get(id: string): SkillDefinition<any, any> | undefined {
    return this.skills.get(id)
  }

  list(): SkillDefinition<any, any>[] {
    return Array.from(this.skills.values())
  }

  listByCategory(category: SkillDefinition['category']): SkillDefinition<any, any>[] {
    return this.list().filter((s) => s.category === category)
  }

  async execute(
    id: string,
    params: unknown,
    context: SkillContext,
  ): Promise<SkillOutput> {
    const skill = this.skills.get(id)
    if (!skill) {
      return {
        success: false,
        error: { code: 'SKILL_NOT_FOUND', message: `Skill ${id} not found` },
      }
    }

    const parsedInput = skill.inputSchema.safeParse(params)
    if (!parsedInput.success) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsedInput.error.message,
        },
      }
    }

    try {
      const result = await skill.execute({ params: parsedInput.data, context })

      if (result.success && result.data !== undefined && skill.outputSchema) {
        const parsedOutput = skill.outputSchema.safeParse(result.data)
        if (!parsedOutput.success) {
          return {
            success: false,
            error: {
              code: 'OUTPUT_VALIDATION_ERROR',
              message: parsedOutput.error.message,
            },
          }
        }
      }

      return result as SkillOutput
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: (err as Error).message,
        },
      }
    }
  }
}

export const skillRegistry = new SkillRegistry()
