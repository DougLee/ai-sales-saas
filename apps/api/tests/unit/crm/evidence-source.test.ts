import { describe, it, expect, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import {
  levelFromEvidenceRows,
  aggregateEvidenceSources,
  readFieldSourcesFromDb,
  readFieldSourcesWithFallback,
  sourceTypeFromName,
  insertEvidenceSource,
  deleteEvidenceSourcesByName,
  accumulateGateFieldSource,
} from '../../../src/crm/projects/verification-tiers.js'
import type { EvidenceSourceDb, EvidenceSourceRow } from '../../../src/crm/projects/verification-tiers.js'

describe('EvidenceSource 表读写（#33 A1）', () => {
  it('levelFromEvidenceRows：final 行锁 final，双来源 cross，单来源 single', () => {
    const row = (over: Partial<EvidenceSourceRow>): EvidenceSourceRow => ({
      fieldPath: 'humanInfo.painPoints',
      sourceType: 'manual',
      sourceName: 'A',
      verifiedLevel: 'single',
      ...over,
    })
    expect(levelFromEvidenceRows([row({ verifiedLevel: 'final' })])).toBe('final')
    expect(levelFromEvidenceRows([row({ sourceName: '录音' }), row({ sourceName: '文档' })])).toBe('cross')
    expect(levelFromEvidenceRows([row({ sourceName: '录音' })])).toBe('single')
    expect(levelFromEvidenceRows([])).toBe('manual')
    // 同名来源不重复计（与 JSON 口径 addSourceToMeta 一致）
    expect(levelFromEvidenceRows([row({ sourceName: '录音' }), row({ sourceName: '录音' })])).toBe('single')
  })

  it('aggregateEvidenceSources：按 fieldPath 分组聚合', () => {
    const metas = aggregateEvidenceSources([
      { fieldPath: 'financeInfo.price', sourceType: 'manual', sourceName: '录音', verifiedLevel: 'single' },
      { fieldPath: 'financeInfo.price', sourceType: 'decision_maker', sourceName: '决策人确认', verifiedLevel: 'final' },
      { fieldPath: 'humanInfo.firstContact', sourceType: 'visit_audio', sourceName: '材料2026/8/14', verifiedLevel: 'single' },
    ])
    expect(metas['financeInfo.price']).toEqual({ level: 'final', sources: ['录音', '决策人确认'] })
    expect(metas['humanInfo.firstContact']).toEqual({ level: 'single', sources: ['材料2026/8/14'] })
  })

  it('readFieldSourcesFromDb：有记录返回聚合，无记录返回 null（回退信号）', async () => {
    const db: EvidenceSourceDb = {
      evidenceSource: {
        findMany: async () => [
          { fieldPath: 'humanInfo.painPoints', sourceType: 'visit_audio', sourceName: '录音', verifiedLevel: 'single' },
          { fieldPath: 'humanInfo.painPoints', sourceType: 'doc', sourceName: '方案文档', verifiedLevel: 'single' },
        ],
        create: async () => ({}),
        deleteMany: async () => ({ count: 0 }),
      },
    }
    const metas = await readFieldSourcesFromDb(db, 'p1')
    expect(metas).toEqual({ 'humanInfo.painPoints': { level: 'cross', sources: ['录音', '方案文档'] } } as never)

    const emptyDb: EvidenceSourceDb = {
      evidenceSource: { findMany: async () => [], create: async () => ({}), deleteMany: async () => ({ count: 0 }) },
    }
    expect(await readFieldSourcesFromDb(emptyDb, 'p1')).toBeNull()
  })

  it('readFieldSourcesWithFallback：表空回退 JSON 镜像（含 ADR-0004 旧结构）', async () => {
    const emptyDb: EvidenceSourceDb = {
      evidenceSource: { findMany: async () => [], create: async () => ({}), deleteMany: async () => ({ count: 0 }) },
    }
    const metas = await readFieldSourcesWithFallback(emptyDb, 'p1', {
      _gateFieldSource: { 'financeInfo.price': 'manual-pass' },
    })
    expect(metas['financeInfo.price']).toEqual({ level: 'final', sources: ['豁免'] })
  })

  it('readFieldSourcesWithFallback：混合态 JSON 垫底 + 表覆盖同字段（存量豁免不消失）', async () => {
    const db: EvidenceSourceDb = {
      evidenceSource: {
        findMany: async () => [
          { fieldPath: 'humanInfo.painPoints', sourceType: 'visit_audio', sourceName: '录音', verifiedLevel: 'single' },
        ],
        create: async () => ({}),
        deleteMany: async () => ({ count: 0 }),
      },
    }
    const metas = await readFieldSourcesWithFallback(db, 'p1', {
      _gateFieldSource: { 'financeInfo.price': 'manual-pass' },
    })
    // 表里没有的字段仍从 JSON 读到
    expect(metas['financeInfo.price']).toEqual({ level: 'final', sources: ['豁免'] })
    // 表里有的字段以表口径为准
    expect(metas['humanInfo.painPoints']).toEqual({ level: 'single', sources: ['录音'] })
  })

  it('sourceTypeFromName 映射：决策人/豁免/文档/录音', () => {
    expect(sourceTypeFromName('决策人确认')).toBe('decision_maker')
    expect(sourceTypeFromName('豁免')).toBe('manual')
    expect(sourceTypeFromName('方案文档')).toBe('doc')
    expect(sourceTypeFromName('材料2026/8/14')).toBe('visit_audio')
    expect(sourceTypeFromName('别的')).toBe('manual')
  })

  it('insertEvidenceSource / deleteEvidenceSourcesByName 参数口径', async () => {
    const created: unknown[] = []
    const deleted: unknown[] = []
    const db: EvidenceSourceDb = {
      evidenceSource: {
        findMany: async () => [],
        create: async (args) => {
          created.push(args)
          return {}
        },
        deleteMany: async (args) => {
          deleted.push(args)
          return { count: 1 }
        },
      },
    }
    await insertEvidenceSource(db, { tenantId: 't1', projectId: 'p1', fieldPath: 'financeInfo.price', sourceName: '材料2026/8/14' })
    expect(created).toHaveLength(1)
    expect((created[0] as { data: Record<string, unknown> }).data).toMatchObject({
      tenantId: 't1', projectId: 'p1', fieldPath: 'financeInfo.price', sourceType: 'visit_audio', verifiedLevel: 'single',
    })

    await deleteEvidenceSourcesByName(db, 'p1', 'financeInfo.price', ['录音'])
    expect(deleted[0]).toMatchObject({ where: { projectId: 'p1', fieldPath: 'financeInfo.price', sourceName: { in: ['录音'] } } })
    await deleteEvidenceSourcesByName(db, 'p1', 'financeInfo.price') // 省略 = 删该字段全部
    expect(deleted[1]).toMatchObject({ where: { projectId: 'p1', fieldPath: 'financeInfo.price' } })
  })

  it('accumulateGateFieldSource：双写（EvidenceSource 行 + JSON 镜像），签名不变', async () => {
    const evidenceJson = {
      _gateFieldSource: { 'financeInfo.price': { level: 'single', sources: ['拜访录音'] } },
    }
    const created: unknown[] = []
    const updates: unknown[] = []
    const prisma = {
      project: {
        findFirst: async () => ({ tenantId: 't1', evidence: evidenceJson }),
        update: async (args: unknown) => {
          updates.push(args)
          return {}
        },
      },
      evidenceSource: {
        findMany: async () => [], // 表空 → 回退 JSON
        create: async (args: unknown) => {
          created.push(args)
          return {}
        },
        deleteMany: async () => ({ count: 0 }),
      },
    } as unknown as PrismaClient

    await accumulateGateFieldSource(prisma, 'p1', 'financeInfo.price', '材料2026/8/14')

    // 写 1：表（每来源一行）
    expect(created).toHaveLength(1)
    expect((created[0] as { data: Record<string, unknown> }).data).toMatchObject({
      tenantId: 't1', projectId: 'p1', fieldPath: 'financeInfo.price', sourceName: '材料2026/8/14', sourceType: 'visit_audio',
    })
    // 写 2：JSON 镜像升级 single → cross
    expect(updates).toHaveLength(1)
    const data = (updates[0] as { data: { evidence: { _gateFieldSource: Record<string, { level: string; sources: string[] }> } } }).data
    expect(data.evidence._gateFieldSource['financeInfo.price']).toEqual({ level: 'cross', sources: ['拜访录音', '材料2026/8/14'] })
  })

  it('accumulateGateFieldSource：表有记录走表口径；重复来源跳过；表写失败不阻塞镜像', async () => {
    const evidenceJson = {
      _gateFieldSource: { 'financeInfo.price': { level: 'single', sources: ['拜访录音'] } },
    }

    // 场景 A：表有记录（含另一来源）→ 表口径聚合，新增第三来源仍 cross
    let created: unknown[] = []
    let updates: unknown[] = []
    let tableRows = [
      { fieldPath: 'financeInfo.price', sourceType: 'visit_audio', sourceName: '拜访录音', verifiedLevel: 'single' },
    ]
    const mkPrisma = () => ({
      project: {
        findFirst: async () => ({ tenantId: 't1', evidence: evidenceJson }),
        update: async (args: unknown) => {
          updates.push(args)
          return {}
        },
      },
      evidenceSource: {
        findMany: async () => tableRows,
        create: async (args: unknown) => {
          created.push(args)
          return {}
        },
        deleteMany: async () => ({ count: 0 }),
      },
    }) as unknown as PrismaClient

    await accumulateGateFieldSource(mkPrisma(), 'p1', 'financeInfo.price', '材料2026/8/14')
    expect(created).toHaveLength(1)
    expect((updates[0] as { data: { evidence: Record<string, unknown> } }).data.evidence).toMatchObject({
      _gateFieldSource: { 'financeInfo.price': { level: 'cross', sources: ['拜访录音', '材料2026/8/14'] } },
    })

    // 场景 B：来源已存在（表口径）→ 零写入
    created = []
    updates = []
    tableRows = [
      { fieldPath: 'financeInfo.price', sourceType: 'visit_audio', sourceName: '拜访录音', verifiedLevel: 'single' },
      { fieldPath: 'financeInfo.price', sourceType: 'doc', sourceName: '方案文档', verifiedLevel: 'single' },
    ]
    await accumulateGateFieldSource(mkPrisma(), 'p1', 'financeInfo.price', '拜访录音')
    expect(created).toHaveLength(0)
    expect(updates).toHaveLength(0)

    // 场景 C：表写失败（旧库未迁移）→ JSON 镜像仍写入
    created = []
    updates = []
    tableRows = []
    const failing = {
      project: {
        findFirst: async () => ({ tenantId: 't1', evidence: evidenceJson }),
        update: async (args: unknown) => {
          updates.push(args)
          return {}
        },
      },
      evidenceSource: {
        findMany: async () => [],
        create: async () => {
          throw new Error('relation "EvidenceSource" does not exist')
        },
        deleteMany: async () => ({ count: 0 }),
      },
    } as unknown as PrismaClient
    await expect(accumulateGateFieldSource(failing, 'p1', 'financeInfo.price', '材料2026/8/14')).resolves.toBeUndefined()
    expect(updates).toHaveLength(1)
  })

  it('accumulateGateFieldSource：字段无既有记录（历史数据）→ 跳过', async () => {
    const prisma = {
      project: { findFirst: async () => ({ tenantId: 't1', evidence: {} }), update: async () => ({}) },
      evidenceSource: { findMany: async () => [], create: vi.fn(async () => ({})), deleteMany: async () => ({ count: 0 }) },
    } as unknown as PrismaClient
    await accumulateGateFieldSource(prisma, 'p1', 'financeInfo.price', '材料2026/8/14')
    expect((prisma as unknown as { evidenceSource: { create: ReturnType<typeof vi.fn> } }).evidenceSource.create).not.toHaveBeenCalled()
  })
})
