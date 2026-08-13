/**
 * 关键 API 请求/响应 Zod 契约
 */

const { z } = require('zod');

// ============================================================
// Agent Command API
// ============================================================
const agentCommandRequestSchema = z.object({
  message: z.string().min(1).max(5000),
  context: z.object({
    projectId: z.union([z.string(), z.number()]).optional(),
    leadId: z.union([z.string(), z.number()]).optional(),
    fileIds: z.array(z.string()).optional(),
  }).optional(),
  mode: z.enum(['chat', 'execute']).optional().default('chat'),
});

const agentCommandResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    reply: z.string(),
    toolsUsed: z.array(z.string()).optional(),
    reasoning: z.string().optional(),
    suggestions: z.array(z.string()).optional(),
  }).optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.any()).optional(),
  }).optional(),
  requestId: z.string(),
});

// ============================================================
// Workflow Result
// ============================================================
const workflowResultSchema = z.object({
  workflowId: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  outputs: z.record(z.any()).optional(),
  errors: z.array(z.object({
    step: z.string(),
    message: z.string(),
  })).optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
});

// ============================================================
// Reasoning Result
// ============================================================
const reasoningResultSchema = z.object({
  intent: z.string(),
  confidence: z.number().min(0).max(1),
  parameters: z.record(z.any()).optional(),
  tools: z.array(z.string()).optional(),
  directAnswer: z.boolean().optional(),
});

module.exports = {
  apiRequestSchemas: {
    agentCommand: agentCommandRequestSchema,
  },
  apiResponseSchemas: {
    agentCommand: agentCommandResponseSchema,
    workflow: workflowResultSchema,
    reasoning: reasoningResultSchema,
  },
};
