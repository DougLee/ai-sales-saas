import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cancelTasksForEntity } from '../../../../src/crm/tasks/task-cleanup.util.js'

describe('cancelTasksForEntity', () => {
  let updateMany: ReturnType<typeof vi.fn>
  let tx: { task: { updateMany: typeof updateMany } }

  beforeEach(() => {
    updateMany = vi.fn().mockResolvedValue({ count: 0 })
    tx = { task: { updateMany } }
  })

  it('returns 0 when no target is provided', async () => {
    const result = await cancelTasksForEntity(tx as never, {})
    expect(result).toBe(0)
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('cancels tasks linked by projectId', async () => {
    updateMany.mockResolvedValue({ count: 3 })
    const result = await cancelTasksForEntity(tx as never, { projectId: 'project_1' })
    expect(result).toBe(3)
    expect(updateMany).toHaveBeenCalledTimes(1)
    const call = updateMany.mock.calls[0][0]
    expect(call.where.OR).toEqual([{ projectId: 'project_1' }])
    expect(call.where.status).toEqual({ notIn: ['COMPLETED', 'CANCELLED'] })
    expect(call.data.status).toBe('CANCELLED')
    expect(call.data.projectId).toBeNull()
  })

  it('cancels tasks linked by companyId', async () => {
    await cancelTasksForEntity(tx as never, { companyId: 'company_1' })
    const call = updateMany.mock.calls[0][0]
    expect(call.where.OR).toEqual([{ companyId: 'company_1' }])
    expect(call.data.companyId).toBeNull()
  })

  it('cancels tasks linked by leadId via source/sourceId', async () => {
    await cancelTasksForEntity(tx as never, { leadId: 'lead_1' })
    const call = updateMany.mock.calls[0][0]
    expect(call.where.OR).toHaveLength(1)
    expect(call.where.OR[0]).toEqual({
      AND: [
        { sourceId: 'lead_1' },
        { source: { in: ['lead_follow_up', 'daily_scan_OVERDUE_LEAD'] } },
      ],
    })
  })

  it('cancels tasks linked by visitId via source/sourceId', async () => {
    await cancelTasksForEntity(tx as never, { visitId: 'visit_1' })
    const call = updateMany.mock.calls[0][0]
    expect(call.where.OR[0]).toEqual({
      AND: [
        { sourceId: 'visit_1' },
        { source: { in: ['visit_analysis', 'visit_next_action'] } },
      ],
    })
  })

  it('combines multiple filters when multiple targets are provided', async () => {
    await cancelTasksForEntity(tx as never, {
      projectId: 'project_1',
      companyId: 'company_1',
      leadId: 'lead_1',
    })
    const call = updateMany.mock.calls[0][0]
    expect(call.where.OR).toHaveLength(3)
    expect(call.data.projectId).toBeNull()
    expect(call.data.companyId).toBeNull()
  })

  it('does not nullify unrelated foreign keys', async () => {
    await cancelTasksForEntity(tx as never, { projectId: 'project_1' })
    const call = updateMany.mock.calls[0][0]
    expect(call.data.projectId).toBeNull()
    expect(call.data.companyId).toBeUndefined()
  })

  it('passes status notIn COMPLETED and CANCELLED to avoid re-cancelling', async () => {
    await cancelTasksForEntity(tx as never, { projectId: 'project_1' })
    const call = updateMany.mock.calls[0][0]
    expect(call.where.status).toEqual({ notIn: ['COMPLETED', 'CANCELLED'] })
  })
})