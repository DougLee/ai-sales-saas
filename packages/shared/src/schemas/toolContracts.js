/**
 * 工具输入/输出 Zod 契约
 * 历史说明：原与 backend/src/agent/tools/ 保持一致；tools 已迁移为 skills，
 * 本文件保留供 schema-sync linter 与兼容代码参考，后续随 Skill 契约改造统一替换。
 */

const { z } = require('zod');

// ============================================================
// 通用输出结构
// ============================================================
const toolResultSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  model: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  evidence: z.array(z.object({
    milestone: z.string().optional(),
    type: z.string(),
    description: z.string(),
    confidence: z.number().min(0).max(1).optional(),
  })).optional(),
  error: z.string().optional(),
});

// ============================================================
// 工具输入契约
// ============================================================
const healthCheckInputSchema = z.object({
  project_id: z.union([z.string(), z.number()]).optional(),
  project_name: z.string().optional(),
}).refine(data => data.project_id || data.project_name, {
  message: 'project_id 或 project_name 至少提供一个',
});

const customerSearchInputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

const entityExtractionInputSchema = z.object({
  text: z.string().min(1),
  entity_types: z.array(z.enum(['person', 'company', 'product', 'event', 'location'])).optional(),
});

const documentAnalyzerInputSchema = z.object({
  file_id: z.string().min(1),
  analysis_type: z.enum(['summary', 'extract', 'compare']).optional().default('summary'),
});

const customer360InputSchema = z.object({
  customer_id: z.union([z.string(), z.number()]).optional(),
  customer_name: z.string().optional(),
}).refine(data => data.customer_id || data.customer_name, {
  message: 'customer_id 或 customer_name 至少提供一个',
});

const kbDeepSearchInputSchema = z.object({
  query: z.string().min(1),
  top_k: z.number().int().min(1).max(20).optional().default(5),
  filters: z.record(z.any()).optional(),
});

const decisionChainInputSchema = z.object({
  project_id: z.union([z.string(), z.number()]),
});

const policyRadarInputSchema = z.object({
  industry: z.string().optional(),
  keyword: z.string().optional(),
  days: z.number().int().min(1).max(365).optional().default(30),
});

const salesForecastInputSchema = z.object({
  project_ids: z.array(z.union([z.string(), z.number()])).optional(),
  time_range_months: z.number().int().min(1).max(24).optional().default(6),
});

const completenessCheckInputSchema = z.object({
  project_id: z.union([z.string(), z.number()]).optional(),
  project_name: z.string().optional(),
}).refine(data => data.project_id || data.project_name, {
  message: 'project_id 或 project_name 至少提供一个',
});

const competitorAnalysisInputSchema = z.object({
  competitors: z.array(z.string()).min(1),
  dimensions: z.array(z.enum(['product', 'price', 'market', 'strategy'])).optional(),
});

const quoteStrategyInputSchema = z.object({
  project_id: z.union([z.string(), z.number()]),
  customer_budget: z.number().positive().optional(),
});

const leadAnalysisInputSchema = z.object({
  lead_id: z.union([z.string(), z.number()]).optional(),
  lead_name: z.string().optional(),
}).refine(data => data.lead_id || data.lead_name, {
  message: 'lead_id 或 lead_name 至少提供一个',
});

const deepBackgroundCheckInputSchema = z.object({
  company_name: z.string().min(1),
  depth: z.enum(['basic', 'standard', 'deep']).optional().default('standard'),
});

const backgroundResearchInputSchema = z.object({
  topic: z.string().min(1),
  source_type: z.enum(['news', 'policy', 'industry', 'academic']).optional(),
});

const entitySyncInputSchema = z.object({
  source: z.enum(['crm', 'erp', 'manual']).optional().default('manual'),
  entity_type: z.enum(['contact', 'company', 'project']),
  data: z.record(z.any()),
});

// ============================================================
// 导出
// ============================================================
const toolInputSchemas = {
  healthCheck: healthCheckInputSchema,
  customerSearch: customerSearchInputSchema,
  entityExtraction: entityExtractionInputSchema,
  documentAnalyzer: documentAnalyzerInputSchema,
  customer360: customer360InputSchema,
  kbDeepSearch: kbDeepSearchInputSchema,
  decisionChain: decisionChainInputSchema,
  policyRadar: policyRadarInputSchema,
  salesForecast: salesForecastInputSchema,
  completenessCheck: completenessCheckInputSchema,
  competitorAnalysis: competitorAnalysisInputSchema,
  quoteStrategy: quoteStrategyInputSchema,
  leadAnalysis: leadAnalysisInputSchema,
  deepBackgroundCheck: deepBackgroundCheckInputSchema,
  backgroundResearch: backgroundResearchInputSchema,
  entitySync: entitySyncInputSchema,
};

module.exports = {
  toolInputSchemas,
  toolResultSchema,
};
