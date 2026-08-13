import type { PrismaClient } from '@prisma/client'

export type ChangeHistoryEntityType = 'company' | 'contact' | 'lead' | 'project'
export type ChangeSource = 'manual' | 'ai' | 'import' | 'merge' | 'system'

export interface ChangeRecordInput {
  entityType: ChangeHistoryEntityType
  entityId: string
  fieldName: string
  oldValue?: string | null
  newValue?: string | null
  changedBy: string
  changeSource?: ChangeSource
}

export async function recordChange(
  prisma: PrismaClient,
  tenantId: string,
  input: ChangeRecordInput,
) {
  return prisma.changeHistory.create({
    data: {
      tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      fieldName: input.fieldName,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
      changedBy: input.changedBy,
      changeSource: input.changeSource ?? 'manual',
    },
  })
}

export async function getChangeHistory(
  prisma: PrismaClient,
  tenantId: string,
  entityType: ChangeHistoryEntityType,
  entityId: string,
  limit = 50,
) {
  return prisma.changeHistory.findMany({
    where: { tenantId, entityType, entityId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}

export async function recordFieldChanges(
  prisma: PrismaClient,
  tenantId: string,
  entityType: ChangeHistoryEntityType,
  entityId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  changedBy: string,
  changeSource: ChangeSource = 'manual',
  trackedFields?: string[],
) {
  const changes: Array<{ field: string; old: string; new: string }> = []
  const fields = trackedFields ?? Object.keys(after)

  for (const field of fields) {
    const oldValue = before[field]
    const newValue = after[field]
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes.push({
        field,
        old: oldValue == null ? '' : String(oldValue),
        new: newValue == null ? '' : String(newValue),
      })
    }
  }

  if (changes.length === 0) return []

  await prisma.changeHistory.createMany({
    data: changes.map((c) => ({
      tenantId,
      entityType,
      entityId,
      fieldName: c.field,
      oldValue: c.old,
      newValue: c.new,
      changedBy,
      changeSource,
    })),
  })

  return changes
}
