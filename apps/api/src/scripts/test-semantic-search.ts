import { semanticSearch } from '../knowledge-base/kb-embedder.js'

async function main() {
  const results = await semanticSearch('default', '如何挖掘客户的隐性需求', 3)
  console.log(`Found ${results.length} results:`)
  for (const r of results) {
    console.log(`  [${(r.similarity * 100).toFixed(1)}%] ${r.fileName}`)
    console.log(`    ${r.content.slice(0, 120)}...`)
  }
}

main().catch(console.error)
