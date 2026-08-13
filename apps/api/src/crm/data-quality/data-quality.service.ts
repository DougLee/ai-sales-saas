import type { PrismaClient } from '@prisma/client'

export interface CompletenessResult {
  score: number
  missingFields: string[]
}

export interface DuplicateCandidate {
  id: string
  name: string
  similarity: number
  reason: string
}

export function computeCompanyCompleteness(
  company: {
    name?: string | null
    industry?: string | null
    scale?: string | null
    region?: string | null
    level?: string | null
    address?: string | null
    website?: string | null
    contactPerson?: string | null
    contactPhone?: string | null
    notes?: string | null
  },
  contacts: Array<{ phone?: string | null; decisionRole?: string | null }>,
  projects: unknown[],
  visits: Array<{ visitTime: Date }>,
): CompletenessResult {
  let score = 0
  const missingFields: string[] = []

  // 基础信息完整（25分）
  const baseFields: { key: string; label: string }[] = [
    { key: 'name', label: '客户名称' },
    { key: 'industry', label: '所属行业' },
    { key: 'scale', label: '客户规模' },
    { key: 'region', label: '所在地区' },
    { key: 'level', label: '客户等级' },
  ]
  const baseScorePerField = 25 / baseFields.length
  for (const field of baseFields) {
    if (company[field.key as keyof typeof company]) {
      score += baseScorePerField
    } else {
      missingFields.push(field.label)
    }
  }

  // 联系人完整（25分）：联系人档案带电话；存量数据兼容——公司平铺字段有联系人+电话也算
  // （客户表单的"联系人/电话"写在 Company 上，早期不产生 Contact 档案，不能当没填）
  const hasContactWithPhone =
    (contacts.length > 0 && contacts.some((c) => c.phone)) ||
    (!!company.contactPerson && !!company.contactPhone)
  if (hasContactWithPhone) {
    score += 25
  } else {
    missingFields.push('联系人及手机号')
  }

  // 决策链覆盖（20分）
  if (contacts.some((c) => c.decisionRole === 'DECISION_MAKER')) {
    score += 20
  } else {
    missingFields.push('决策人')
  }

  // 近期有拜访（15分）
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  if (visits.some((v) => new Date(v.visitTime) > thirtyDaysAgo)) {
    score += 15
  } else {
    missingFields.push('30天内拜访')
  }

  // 有线索或商机关联（15分）
  if (projects.length > 0) {
    score += 15
  } else {
    missingFields.push('关联线索或商机')
  }

  return { score: Math.min(100, Math.round(score)), missingFields }
}

export async function detectDuplicateCompanies(
  prisma: PrismaClient,
  tenantId: string,
  name: string,
  excludeId?: string,
): Promise<DuplicateCandidate[]> {
  const candidates = await prisma.company.findMany({
    where: {
      tenantId,
      deletedAt: null,
      id: excludeId ? { not: excludeId } : undefined,
      OR: [
        { name: { contains: name, mode: 'insensitive' } },
        { name: { startsWith: name.substring(0, Math.min(4, name.length)), mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, contactPhone: true },
    take: 20,
  })

  const normalizedInput = name.toLowerCase().replace(/\s+/g, '')
  return candidates
    .map((c) => {
      const normalizedCandidate = c.name.toLowerCase().replace(/\s+/g, '')
      const common = longestCommonSubsequence(normalizedInput, normalizedCandidate)
      const similarity = Math.round((common / Math.max(normalizedInput.length, normalizedCandidate.length)) * 100)
      return {
        id: c.id,
        name: c.name,
        similarity,
        reason: similarity >= 80 ? '名称高度相似' : '名称部分匹配',
      }
    })
    .filter((c) => c.similarity >= 40)
    .sort((a, b) => b.similarity - a.similarity)
}

export function longestCommonSubsequence(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }
  return dp[m][n]
}

export function getMissingFieldLabels(missingFields: string[]): { field: string; label: string; severity: 'high' | 'medium' }[] {
  const severityMap: Record<string, 'high' | 'medium'> = {
    '客户名称': 'high',
    '所属行业': 'medium',
    '客户规模': 'medium',
    '所在地区': 'medium',
    '客户等级': 'medium',
    '联系人及手机号': 'high',
    '决策人': 'high',
    '30天内拜访': 'medium',
    '关联线索或商机': 'medium',
  }

  return missingFields.map((field) => ({
    field,
    label: field,
    severity: severityMap[field] || 'medium',
  }))
}
