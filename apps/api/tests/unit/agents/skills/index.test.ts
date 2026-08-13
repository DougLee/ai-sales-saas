import { describe, it, expect } from 'vitest'
import {
  skillRegistry,
  SkillRegistry,
  leadQuerySkill,
  projectQuerySkill,
  companyQuerySkill,
  webSearchSkill,
  kbSearchSkill,
  projectAnalysisSkill,
  briefingQuerySkill,
  visitQuerySkill,
  visitAnalysisSkill,
  visitActionSkill,
  taskActionSkill,
  leadActionSkill,
} from '../../../../src/agents/skills/index.js'

describe('skills index', () => {
  it('exports skill registry', () => {
    expect(skillRegistry).toBeInstanceOf(SkillRegistry)
  })

  it('exports all skills with required fields', () => {
    const skills = [
      leadQuerySkill,
      projectQuerySkill,
      companyQuerySkill,
      webSearchSkill,
      kbSearchSkill,
      projectAnalysisSkill,
      briefingQuerySkill,
      visitQuerySkill,
      visitAnalysisSkill,
      visitActionSkill,
      taskActionSkill,
      leadActionSkill,
    ]
    for (const skill of skills) {
      expect(skill).toHaveProperty('id')
      expect(skill).toHaveProperty('execute')
      expect(skill).toHaveProperty('inputSchema')
      expect(skill).toHaveProperty('outputSchema')
    }
  })
})
