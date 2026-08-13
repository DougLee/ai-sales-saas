/**
 * @fileoverview JSDoc 类型定义共享层
 * 供前后端通过 @typedef {import('shared').X} 引用
 *
 * 注意：本文件不运行时导出任何值，仅作为类型声明使用。
 * TypeScript 的 tsc --noEmit + checkJs 模式会读取这些声明。
 */

// ============================================================
// 用户与权限
// ============================================================

/**
 * @typedef {Object} User
 * @property {string|number} id
 * @property {string} name
 * @property {string} phone
 * @property {string} role - 'admin' | 'manager' | 'dept_head' | 'sales'
 * @property {number} [departmentId]
 * @property {string} [dataScope] - 'all' | 'dept' | 'self'
 */

/**
 * @typedef {Object} DataScope
 * @property {string} scope - 'all' | 'dept' | 'self'
 * @property {number} [departmentId]
 */

// ============================================================
// 工具契约
// ============================================================

/**
 * @typedef {Object} ToolResult
 * @property {boolean} success
 * @property {any} [data]
 * @property {string} [model]
 * @property {number} [confidence] - 0~1
 * @property {EvidenceItem[]} [evidence]
 * @property {string} [error]
 */

/**
 * @typedef {Object} EvidenceItem
 * @property {string} [milestone]
 * @property {string} type
 * @property {string} description
 * @property {number} [confidence] - 0~1
 */

/**
 * @typedef {Object} ToolDefinition
 * @property {string} name
 * @property {string} label
 * @property {string} category - 'search' | 'analysis' | 'generation' | 'extraction' | 'check' | 'prediction'
 * @property {Object} inputSchema - JSON Schema
 * @property {number} [timeout]
 * @property {boolean} [idempotent]
 * @property {number} [cacheTTL]
 * @property {boolean} readOnly
 * @property {Function} execute
 * @property {Function} [fallback]
 */

// ============================================================
// Agent 上下文
// ============================================================

/**
 * @typedef {Object} AgentContext
 * @property {User} user
 * @property {Object} [prisma]
 * @property {Object} [tenantWhere] - 由 createSecureTool 自动注入的租户过滤条件
 * @property {string} [sessionId]
 * @property {string} [requestId]
 */

/**
 * @typedef {Object} AgentCommandRequest
 * @property {string} message
 * @property {Object} [context]
 * @property {string|number} [context.projectId]
 * @property {string|number} [context.leadId]
 * @property {string[]} [context.fileIds]
 * @property {'chat'|'execute'} [mode]
 */

/**
 * @typedef {Object} AgentCommandResponse
 * @property {boolean} success
 * @property {Object} [data]
 * @property {string} [data.reply]
 * @property {string[]} [data.toolsUsed]
 * @property {string} [data.reasoning]
 * @property {string[]} [data.suggestions]
 * @property {Object} [error]
 * @property {string} [error.code]
 * @property {string} [error.message]
 * @property {Object} [error.details]
 * @property {string} requestId
 */

// ============================================================
// 销售方法论
// ============================================================

/**
 * @typedef {Object} Milestone
 * @property {number} index
 * @property {string} name
 * @property {string} description
 * @property {Object} thresholds
 * @property {number} thresholds.maxDays
 * @property {number} thresholds.minContacts
 * @property {number} thresholds.minVisits
 */

/**
 * @typedef {Object} MethodologyConfig
 * @property {string} version
 * @property {Milestone[]} milestones
 * @property {Object} decisionRoles
 * @property {Object} salesPhilosophy
 */

// ============================================================
// Prisma 相关
// ============================================================

/**
 * @typedef {Object} PrismaWhere
 * @property {any} [AND]
 * @property {any} [OR]
 * @property {any} [NOT]
 * @property {string|number} [ownerId]
 * @property {Object} [users]
 */
