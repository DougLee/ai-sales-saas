import 'dotenv/config'
import { routeIntent } from '../src/agents/core/agent-router.js'
import { INTENT_TEST_CASES } from '../tests/unit/agents/intent-cases/cases.js'

async function main() {
  let passed = 0
  let failed = 0
  const failures: Array<{ message: string; expected: string; actual: string; confidence: number }> = []

  for (const tc of INTENT_TEST_CASES) {
    try {
      const result = await routeIntent(tc.message)
      const ok = result.intent === tc.expectedIntent
      if (ok) {
        passed++
        console.log(`✅ ${tc.description || tc.message} → ${result.intent} (${result.confidence.toFixed(2)})`)
      } else {
        failed++
        failures.push({ message: tc.message, expected: tc.expectedIntent, actual: result.intent, confidence: result.confidence })
        console.log(`❌ ${tc.description || tc.message} → expected ${tc.expectedIntent}, got ${result.intent} (${result.confidence.toFixed(2)})`)
      }
    } catch (err) {
      failed++
      failures.push({ message: tc.message, expected: tc.expectedIntent, actual: 'ERROR', confidence: 0 })
      console.log(`💥 ${tc.description || tc.message} → ERROR: ${(err as Error).message}`)
    }
  }

  const total = passed + failed
  const accuracy = total > 0 ? (passed / total) * 100 : 0
  console.log(`\n=== 评估结果 ===`)
  console.log(`总用例: ${total}`)
  console.log(`通过: ${passed}`)
  console.log(`失败: ${failed}`)
  console.log(`准确率: ${accuracy.toFixed(1)}%`)

  if (failures.length > 0) {
    console.log(`\n失败详情:`)
    failures.forEach((f) => {
      console.log(`  - "${f.message}"`)
      console.log(`    expected: ${f.expected}, actual: ${f.actual}, confidence: ${f.confidence.toFixed(2)}`)
    })
  }

  process.exit(accuracy >= 80 ? 0 : 1)
}

main()
