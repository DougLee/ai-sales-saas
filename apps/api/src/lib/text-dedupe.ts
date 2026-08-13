/**
 * 文本去重工具（V6.2：AI 提取产物的语义去重）
 *
 * LLM 倾向于把同一件事换角度说几遍（"提交方案初稿" / "按时提交方案初稿，确保内容专业"）。
 * 这里用字符 bigram 的 Dice 系数做轻量语义相似度，不引入额外依赖、结果确定可测。
 */

/** 归一化：去空白/标点/大小写，只留有效字符 */
export function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
}

/**
 * 字符级相似度：max(bigram Dice, 短句 bigram 覆盖率)，含包含关系快路径。
 * 0 完全不同，1 完全相同。
 * 校准（2026-08-10 真实样本）：换角度复述 ≈0.40-0.42，独立动作 ≤0.29。
 */
export function bigramSimilarity(a: string, b: string): number {
  let na = normalizeText(a)
  let nb = normalizeText(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  // 一方完全包含另一方（"提交方案" vs "按时提交方案初稿"）→ 高相似
  if (na.includes(nb) || nb.includes(na)) return 0.9
  if (na.length < 2 || nb.length < 2) return 0

  const grams = (s: string) => {
    const set = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2)
      set.set(g, (set.get(g) || 0) + 1)
    }
    return set
  }
  const ga = grams(na)
  const gb = grams(nb)
  let overlap = 0
  for (const [g, count] of ga) {
    overlap += Math.min(count, gb.get(g) || 0)
  }
  let totalA = 0
  for (const c of ga.values()) totalA += c
  let totalB = 0
  for (const c of gb.values()) totalB += c
  const dice = (2 * overlap) / (totalA + totalB)
  // 短句覆盖率：短句的 bigram 有多少落在长句里（"提交方案初稿"被长句覆盖≠整句重复时才拉开差距）
  const coverage = overlap / Math.min(totalA, totalB)
  return Math.max(dice, coverage)
}

/**
 * 相似项去重：保留信息量更大的（更长的）那条。
 * threshold 默认 0.35：校准样本中换角度复述 ≥0.40，独立动作 ≤0.29。
 */
export function dedupeSimilar(items: string[], threshold = 0.35): string[] {
  const kept: string[] = []
  for (const raw of items) {
    const item = raw?.trim()
    if (!item) continue
    const dupIdx = kept.findIndex((k) => bigramSimilarity(k, item) >= threshold)
    if (dupIdx === -1) {
      kept.push(item)
    } else if (normalizeText(item).length > normalizeText(kept[dupIdx]).length) {
      kept[dupIdx] = item // 同一件事，留信息量大的版本
    }
  }
  return kept
}

/** 过滤掉与参照集（如库内已有任务标题）相似的项 */
export function filterSimilarTo(items: string[], references: string[], threshold = 0.35): string[] {
  const refs = references.map((r) => r?.trim()).filter(Boolean) as string[]
  if (!refs.length) return items
  return items.filter((item) => !refs.some((ref) => bigramSimilarity(ref, item) >= threshold))
}
