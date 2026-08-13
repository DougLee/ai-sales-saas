export {
  DEFAULT_MILESTONE_GATES,
  MILESTONE_LABELS,
  validateMilestoneAdvance,
  loadMilestoneGates,
  getNestedValue,
  isEmptyValue,
} from './gate-validator.js'

export type {
  GateRule,
  CompoundRule,
  GateRuleNode,
  EvidenceRequirement,
  MilestoneGate,
  GateValidationResult,
} from './gate-validator.js'
