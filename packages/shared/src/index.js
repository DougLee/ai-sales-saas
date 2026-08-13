/**
 * @ai-sales/shared
 * 前后端共享层：Zod Schema、常量、JSDoc 类型
 */

const { toolInputSchemas, toolResultSchema } = require('./schemas/toolContracts');
const { apiRequestSchemas, apiResponseSchemas } = require('./schemas/apiContracts');
const { MILESTONES, DECISION_ROLES, SALES_PHILOSOPHY, VERSION } = require('./constants/methodology');

module.exports = {
  // Tool contracts
  toolInputSchemas,
  toolResultSchema,

  // API contracts
  apiRequestSchemas,
  apiResponseSchemas,

  // Methodology constants
  MILESTONES,
  DECISION_ROLES,
  SALES_PHILOSOPHY,
  VERSION,
};
