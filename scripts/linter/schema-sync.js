#!/usr/bin/env node
/**
 * @fileoverview Schema Sync Checker
 * 对比 Prisma schema、工具 inputSchema 和共享 Zod Schema 的一致性
 */

const fs = require('fs');
const path = require('path');

const BACKEND_ROOT = path.resolve(__dirname, '../../../backend');
const SHARED_ROOT = path.resolve(__dirname, '../../../ai-sales-saas/packages/shared');
const BASELINE_PATH = path.join(BACKEND_ROOT, '.lint-baseline.json');

// ============================================================
// 基线加载
// ============================================================
function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return new Set();
  try {
    const data = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8'));
    return new Set(data.violations || []);
  } catch {
    return new Set();
  }
}

const baseline = loadBaseline();

function makeKey(tool, type) {
  return `schema-sync:${tool}:${type}`;
}

function saveBaseline(keys) {
  const data = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8'));
  data.violations = Array.from(new Set([...(data.violations || []), ...keys]));
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`基线已更新: ${BASELINE_PATH}`);
}

// ============================================================
// Prisma Schema 解析器
// ============================================================
function parsePrismaSchema() {
  const schemaPath = path.join(BACKEND_ROOT, 'prisma/schema.prisma');
  if (!fs.existsSync(schemaPath)) {
    console.error('❌ 找不到 Prisma schema:', schemaPath);
    process.exit(1);
  }

  const source = fs.readFileSync(schemaPath, 'utf-8');
  const models = {};

  const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/gs;
  let match;
  while ((match = modelRegex.exec(source)) !== null) {
    const modelName = match[1].toLowerCase();
    const body = match[2];
    const fields = {};

    const fieldLines = body.split('\n');
    for (const line of fieldLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;

      // 匹配: fieldName  Type  @attributes
      const fieldMatch = trimmed.match(/^(\w+)\s+(\w+[^\s@]*)\s*(.*)$/);
      if (fieldMatch) {
        const [, fieldName, fieldType, attrs] = fieldMatch;
        fields[fieldName] = {
          type: fieldType.trim(),
          optional: fieldType.trim().startsWith('?'),
          isId: attrs.includes('@id'),
          isUnique: attrs.includes('@unique'),
          hasDefault: attrs.includes('@default'),
          isRelation: attrs.includes('@relation'),
        };
      }
    }

    models[modelName] = fields;
  }

  return models;
}

// ============================================================
// 工具 inputSchema 提取器
// ============================================================
function extractToolInputSchemas() {
  const toolsDir = path.join(BACKEND_ROOT, 'src/agent/tools');
  const tools = {};

  const files = fs.readdirSync(toolsDir).filter(f => f.endsWith('.js') && f !== 'index.js' && f !== 'createSecureTool.js');
  for (const file of files) {
    const filePath = path.join(toolsDir, file);
    const source = fs.readFileSync(filePath, 'utf-8');

    // 提取 name
    const nameMatch = source.match(/name\s*:\s*['"`]([^'"`]+)['"`]/);
    const toolName = nameMatch ? nameMatch[1] : file.replace('.js', '');

    // 提取 inputSchema
    const schemaMatch = source.match(/inputSchema\s*:\s*(\{[\s\S]*?\n\s*\})/);
    if (schemaMatch) {
      try {
        // 简单解析：提取 properties 中的 key
        const propertiesMatch = schemaMatch[1].match(/properties\s*:\s*\{([^}]+)\}/s);
        const requiredMatch = schemaMatch[1].match(/required\s*:\s*\[([^\]]*)\]/s);

        const fields = {};
        if (propertiesMatch) {
          const propLines = propertiesMatch[1].split(',');
          for (const line of propLines) {
            const propMatch = line.match(/(\w+)\s*:\s*\{/);
            if (propMatch) {
              fields[propMatch[1]] = { inInputSchema: true };
            }
          }
        }

        const required = [];
        if (requiredMatch) {
          const reqItems = requiredMatch[1].match(/['"`]([^'"`]+)['"`]/g);
          if (reqItems) {
            reqItems.forEach(item => {
              const key = item.replace(/['"`]/g, '');
              required.push(key);
              if (fields[key]) fields[key].required = true;
            });
          }
        }

        tools[toolName] = { file, fields, required };
      } catch (e) {
        tools[toolName] = { file, fields: {}, parseError: e.message };
      }
    } else {
      tools[toolName] = { file, fields: {}, missingSchema: true };
    }
  }

  return tools;
}

// ============================================================
// 共享 Zod Schema 提取器
// ============================================================
function extractSharedSchemas() {
  const contractsPath = path.join(SHARED_ROOT, 'src/schemas/toolContracts.js');
  if (!fs.existsSync(contractsPath)) {
    return {};
  }

  const source = fs.readFileSync(contractsPath, 'utf-8');
  const schemas = {};

  // 匹配 toolInputSchemas 中的条目
  const regex = /(\w+)\s*:\s*(\w+)InputSchema/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    const toolKey = match[1];
    schemas[toolKey] = { schemaVar: match[2] + 'InputSchema', found: true };
  }

  return schemas;
}

// ============================================================
// 对比逻辑
// ============================================================
function checkToolSchema(toolName, toolData, prismaModels, sharedSchemas) {
  const mismatches = [];

  // 1. 检查共享包中是否有对应的 Zod Schema
  const sharedKey = toolName.replace(/Tool$/, '').replace(/^./, c => c.toLowerCase());
  const sharedMatch = sharedSchemas[sharedKey] || sharedSchemas[toolName];
  if (!sharedMatch) {
    mismatches.push({
      type: 'missing-shared-schema',
      message: `工具 "${toolName}" 在共享包的 toolContracts.js 中缺少对应的 Zod Schema`,
    });
  }

  // 2. 检查 inputSchema 的字段名是否与 Prisma 模型一致（启发式）
  for (const fieldName of Object.keys(toolData.fields)) {
    // 常见的 ID 字段映射
    const prismaFieldName = fieldName.replace(/_id$/, 'Id').replace(/_name$/, 'Name');

    // 检查是否在任何 Prisma 模型中存在
    let foundInPrisma = false;
    for (const [modelName, modelFields] of Object.entries(prismaModels)) {
      if (modelFields[fieldName] || modelFields[prismaFieldName]) {
        foundInPrisma = true;
        break;
      }
    }

    // 常见参数名（非模型字段）白名单
    const commonParams = [
      'query', 'limit', 'top_k', 'filters', 'analysis_type', 'depth', 'time_range_months',
      'dimensions', 'source', 'entity_type', 'data', 'text', 'topic', 'industry', 'keyword',
      'days', 'file_id', 'customer_name', 'company_name', 'targetName', 'customerName',
      'projectId', 'leadId', 'visitId', 'project_id', 'lead_id', 'visit_id',
      'name', 'region', 'competitors', 'includeCompetitors', 'timeRange',
      'purpose', 'mode', 'type', 'page', 'size', 'orderBy', 'sort', 'search',
    ];
    if (!foundInPrisma && !commonParams.includes(fieldName)) {
      mismatches.push({
        type: 'field-not-in-prisma',
        message: `工具 "${toolName}" 的 inputSchema 字段 "${fieldName}" 在 Prisma schema 中找不到对应字段`,
      });
    }
  }

  // 3. 检查 snake_case vs camelCase 混用
  for (const fieldName of Object.keys(toolData.fields)) {
    if (fieldName.includes('_') && !fieldName.endsWith('_id')) {
      mismatches.push({
        type: 'naming-inconsistency',
        severity: 'warn',
        message: `工具 "${toolName}" 的字段 "${fieldName}" 使用了 snake_case，建议统一为 camelCase`,
      });
    }
  }

  return mismatches;
}

// ============================================================
// 主流程
// ============================================================
function main() {
  const isInitMode = process.argv.includes('--init-baseline');

  console.log('========================================');
  console.log('Schema Sync Checker');
  console.log('========================================');

  const prismaModels = parsePrismaSchema();
  const tools = extractToolInputSchemas();
  const sharedSchemas = extractSharedSchemas();

  console.log(`Prisma models: ${Object.keys(prismaModels).length}`);
  console.log(`Tools scanned: ${Object.keys(tools).length}`);
  console.log(`Shared schemas: ${Object.keys(sharedSchemas).length}`);
  console.log('');

  let totalMismatches = 0;
  let errors = 0;
  let allKeys = [];

  for (const [toolName, toolData] of Object.entries(tools)) {
    if (toolData.parseError) {
      console.log(`[ERROR] ${toolData.file}: inputSchema 解析失败 — ${toolData.parseError}`);
      errors++;
      continue;
    }
    if (toolData.missingSchema) {
      console.log(`[ERROR] ${toolData.file}: 缺少 inputSchema`);
      errors++;
      continue;
    }

    const mismatches = checkToolSchema(toolName, toolData, prismaModels, sharedSchemas);
    if (mismatches.length > 0) {
      console.log(`[${toolData.file}] ${toolName}:`);
      for (const m of mismatches) {
        const severity = m.severity || 'error';
        const key = makeKey(toolName, m.type);
        allKeys.push(key);
        if (baseline.has(key)) {
          console.log(`  [BASELINE] ${m.message}`);
        } else {
          console.log(`  [${severity.toUpperCase()}] ${m.message}`);
          if (severity === 'error') errors++;
          totalMismatches++;
        }
      }
    }
  }

  if (isInitMode) {
    saveBaseline(allKeys);
    console.log(`录入 ${allKeys.length} 个 schema-sync 已知问题到基线。`);
    process.exit(0);
  }

  console.log('');
  console.log('========================================');
  console.log(`总计不匹配: ${totalMismatches} (错误: ${errors}, 基线内: ${allKeys.length - totalMismatches})`);
  console.log('========================================');

  if (errors > 0) {
    console.log('❌ 阻断：发现 Schema 不一致，请修复后再提交。');
    process.exit(1);
  } else {
    console.log('✅ Schema 一致性检查通过。');
    process.exit(0);
  }
}

main();
