#!/usr/bin/env node
/**
 * @fileoverview 架构 Linter 统一入口
 * 依次运行 ESLint、tenant-guard、schema-sync
 */

const { execSync } = require('child_process');
const path = require('path');

const BACKEND_DIR = path.resolve(__dirname, '../../../backend');

const STEPS = [
  { name: 'ESLint', cmd: 'npm run lint', cwd: BACKEND_DIR },
  { name: 'Tenant Guard', cmd: 'node ' + path.resolve(__dirname, 'tenant-guard.js'), cwd: process.cwd() },
  { name: 'Schema Sync', cmd: 'node ' + path.resolve(__dirname, 'schema-sync.js'), cwd: process.cwd() },
];

let hasError = false;

console.log('========================================');
console.log('Architecture Linter — 全量扫描');
console.log('========================================\n');

for (const step of STEPS) {
  console.log(`▶ ${step.name}...`);
  try {
    execSync(step.cmd, { cwd: step.cwd, stdio: 'inherit' });
    console.log(`✅ ${step.name} 通过\n`);
  } catch (e) {
    console.log(`❌ ${step.name} 失败\n`);
    hasError = true;
  }
}

console.log('========================================');
if (hasError) {
  console.log('❌ 阻断：架构 Linter 未通过，请修复后再提交。');
  process.exit(1);
} else {
  console.log('✅ 全部通过 — 架构合规检查完成。');
  process.exit(0);
}
