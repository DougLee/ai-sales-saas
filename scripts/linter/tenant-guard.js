#!/usr/bin/env node
// Tenant Guard Linter
// 扫描所有 .js 文件，检查 Prisma 查询是否包含数据隔离（tenant isolation）
//
// 扫描范围：backend/src/routes/ 下所有 .js, backend/src/agent/ 下所有 .js
//
// 规则：
// - findMany/findFirst/findUnique/count/groupBy：
//   PASS: where 包含 buildWhereClause(...) / withTenantIsolation(...) / 显式 ownerId: req.user.id + 角色校验
//   FAIL: where 从 req.query/body 直接取 ownerId，或敏感模型无 where
// - create/update/updateMany/delete/deleteMany：
//   PASS: ownerId 设置为 req.user.id，或调用前有显式授权检查
//   FAIL: ownerId 取自用户输入且无校验

const fs = require('fs');
const path = require('path');

// espree 安装在 backend/node_modules 中，添加解析路径
const BACKEND_NODE_MODULES = path.resolve(__dirname, '../../../backend/node_modules');
module.paths.unshift(BACKEND_NODE_MODULES);
const espree = require('espree');

const BACKEND_ROOT = path.resolve(__dirname, '../../../backend/src');
const BASELINE_PATH = path.resolve(__dirname, '../../../backend/.lint-baseline.json');

// 敏感模型：涉及业务数据的 Prisma model
const SENSITIVE_MODELS = new Set([
  'project', 'lead', 'contact', 'visit', 'task', 'company', 'opportunity',
]);

// 读操作方法
const READ_METHODS = new Set([
  'findMany', 'findFirst', 'findUnique', 'count', 'groupBy',
]);

// 写操作方法
const WRITE_METHODS = new Set([
  'create', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert',
]);

// 白名单文件（不计入违规）
const FILE_WHITELIST = [
  /seed/i,
  /migration/i,
  /scripts\//i,
];

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

function makeKey(file, line, rule) {
  return `${path.relative(process.cwd(), file)}:${line}:${rule}`;
}

function isWhitelisted(filePath) {
  return FILE_WHITELIST.some(pattern => pattern.test(filePath));
}

// ============================================================
// AST 扫描器
// ============================================================
function scanFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf-8');
  let ast;
  try {
    ast = espree.parse(source, {
      ecmaVersion: 2022,
      sourceType: 'module',
      loc: true,
      range: true,
    });
  } catch (e) {
    // 解析失败（可能是 CommonJS 语法问题），回退到简单正则
    return scanWithRegex(filePath, source);
  }

  const violations = [];

  function visit(node) {
    if (!node || typeof node !== 'object') return;

    // 检查 MemberExpression: prisma.model.method(args)
    if (
      node.type === 'CallExpression' &&
      node.callee &&
      node.callee.type === 'MemberExpression' &&
      node.callee.object &&
      node.callee.object.type === 'MemberExpression' &&
      node.callee.object.object &&
      node.callee.object.object.name === 'prisma'
    ) {
      const modelName = node.callee.object.property?.name;
      const methodName = node.callee.property?.name;

      if (!modelName || !methodName) return;
      if (!SENSITIVE_MODELS.has(modelName)) return;

      const line = node.loc?.start?.line || 0;

      // 提取 CallExpression 的源码文本
      const callText = source.substring(node.range[0], node.range[1]);

      if (READ_METHODS.has(methodName)) {
        // 读操作：检查是否有隔离
        const hasIsolation =
          /buildWhereClause|withTenantIsolation|dataScopeFilter|ownerId:\s*req\.user\.id/.test(callText) ||
          /canAccessData|requireRole/.test(source.substring(Math.max(0, node.range[0] - 500), node.range[0]));

        if (!hasIsolation) {
          violations.push({
            file: filePath,
            line,
            rule: 'tenant-guard-read',
            severity: 'high',
            message: `Prisma ${modelName}.${methodName}() 缺少租户隔离（未使用 buildWhereClause / withTenantIsolation）`,
          });
        }
      }

      if (WRITE_METHODS.has(methodName)) {
        // 写操作：检查是否有授权
        const hasAuth =
          /req\.user\.id|ownerId:\s*req\.user\.id|canAccessData|requireRole|buildWhereClause/.test(callText) ||
          /canAccessData|requireRole|authMiddleware/.test(source.substring(Math.max(0, node.range[0] - 500), node.range[0]));

        if (!hasAuth) {
          violations.push({
            file: filePath,
            line,
            rule: 'tenant-guard-write',
            severity: 'high',
            message: `Prisma ${modelName}.${methodName}() 写操作缺少显式授权检查`,
          });
        }
      }
    }

    // 递归遍历
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(visit);
      } else {
        visit(child);
      }
    }
  }

  visit(ast);
  return violations;
}

// 回退：简单正则扫描
function scanWithRegex(filePath, source) {
  const violations = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // 匹配 prisma.model.method(...)
    const match = line.match(/prisma\.(\w+)\.(findMany|findFirst|findUnique|count|groupBy|create|update|updateMany|delete|deleteMany|upsert)\s*\(/);
    if (!match) continue;

    const modelName = match[1];
    const methodName = match[2];
    if (!SENSITIVE_MODELS.has(modelName)) continue;

    // 扩大检查范围到前后 5 行
    const contextBlock = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 6)).join('\n');

    if (READ_METHODS.has(methodName)) {
      const hasIsolation = /buildWhereClause|withTenantIsolation|dataScopeFilter|ownerId:\s*req\.user\.id/.test(contextBlock);
      if (!hasIsolation) {
        violations.push({
          file: filePath,
          line: lineNum,
          rule: 'tenant-guard-read',
          severity: 'high',
          message: `Prisma ${modelName}.${methodName}() 缺少租户隔离（未使用 buildWhereClause / withTenantIsolation）`,
        });
      }
    }

    if (WRITE_METHODS.has(methodName)) {
      const hasAuth = /req\.user\.id|canAccessData|requireRole/.test(contextBlock);
      if (!hasAuth) {
        violations.push({
          file: filePath,
          line: lineNum,
          rule: 'tenant-guard-write',
          severity: 'high',
          message: `Prisma ${modelName}.${methodName}() 写操作缺少显式授权检查`,
        });
      }
    }
  }

  return violations;
}

// ============================================================
// 文件收集
// ============================================================
function collectFiles(dir, pattern) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, pattern));
    } else if (entry.isFile() && entry.name.endsWith('.js') && pattern.test(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

// ============================================================
// 主流程
// ============================================================
function initBaseline(allViolations) {
  const baselineData = {
    generatedAt: new Date().toISOString(),
    tool: 'tenant-guard',
    violations: allViolations.map(v => v.key),
  };
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baselineData, null, 2), 'utf-8');
  console.log(`基线已初始化: ${BASELINE_PATH}`);
  console.log(`录入 ${allViolations.length} 个已知违规，后续运行只报告新增问题。`);
}

function main() {
  const isInitMode = process.argv.includes('--init-baseline');

  const routesDir = path.join(BACKEND_ROOT, 'routes');
  const agentDir = path.join(BACKEND_ROOT, 'agent');

  const allFiles = [
    ...collectFiles(routesDir, /\.js$/),
    ...collectFiles(agentDir, /\.js$/),
  ];

  let allViolations = [];
  let newViolations = [];

  for (const file of allFiles) {
    if (isWhitelisted(file)) continue;
    const violations = scanFile(file);
    for (const v of violations) {
      const key = makeKey(v.file, v.line, v.rule);
      allViolations.push({ ...v, key });
      if (!baseline.has(key)) {
        newViolations.push({ ...v, key });
      }
    }
  }

  // 初始化模式：直接写入 baseline 并退出
  if (isInitMode) {
    initBaseline(allViolations);
    process.exit(0);
  }

  // 输出报告
  console.log('========================================');
  console.log('Tenant Guard Linter Report');
  console.log('========================================');
  console.log(`总扫描文件: ${allFiles.length}`);
  console.log(`总违规数: ${allViolations.length}`);
  console.log(`基线内违规（已知）: ${allViolations.length - newViolations.length}`);
  console.log(`新增违规: ${newViolations.length}`);
  console.log('');

  if (newViolations.length > 0) {
    console.log('【新增违规 — 必须修复】');
    for (const v of newViolations) {
      console.log(`  [${v.severity.toUpperCase()}] ${v.file}:${v.line}`);
      console.log(`    -> ${v.message}`);
    }
    console.log('');
    console.log('阻断：发现新增租户隔离违规，请修复后再提交。');
    process.exit(1);
  } else if (allViolations.length > 0) {
    console.log('无新增违规（基线内还有 ' + (allViolations.length - newViolations.length) + ' 个已知问题待逐步修复）');
    process.exit(0);
  } else {
    console.log('完美：零违规，租户隔离检查通过。');
    process.exit(0);
  }
}

main();
