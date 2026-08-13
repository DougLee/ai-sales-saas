import { describe, it, expect } from 'vitest'
import {
  CreateVisitSchema,
  UpdateVisitSchema,
  ListVisitsQuerySchema,
  LogVisitSchema,
} from '../../../../src/crm/visits/visits.schema.js'

describe('visits.schema', () => {
  describe('CreateVisitSchema', () => {
    it('parses minimal valid visit', () => {
      const result = CreateVisitSchema.parse({
        companyId: 'company_1',
        visitTime: '2026-01-01T10:00:00Z',
        visitType: 'offline',
      })
      expect(result).toMatchObject({
        companyId: 'company_1',
        visitTime: '2026-01-01T10:00:00Z',
        visitType: 'offline',
      })
    })

    it('parses full visit', () => {
      const result = CreateVisitSchema.parse({
        companyId: 'company_1',
        projectId: 'project_1',
        visitTime: '2026-01-01T10:00:00Z',
        visitType: 'online',
        sceneType: 'demo',
        summary: 'summary',
        contactName: 'John',
        nextAction: 'follow up',
        nextActionDeadline: '2026-01-05T10:00:00Z',
      })
      expect(result).toMatchObject({
        companyId: 'company_1',
        projectId: 'project_1',
        visitType: 'online',
        contactName: 'John',
      })
    })

    it('rejects invalid visitType', () => {
      expect(() =>
        CreateVisitSchema.parse({
          companyId: 'company_1',
          visitTime: '2026-01-01T10:00:00Z',
          visitType: 'invalid',
        })
      ).toThrow()
    })

    it('rejects invalid datetime', () => {
      expect(() =>
        CreateVisitSchema.parse({
          companyId: 'company_1',
          visitTime: 'not-a-date',
          visitType: 'phone',
        })
      ).toThrow()
    })
  })

  describe('UpdateVisitSchema', () => {
    it('allows partial update', () => {
      const result = UpdateVisitSchema.parse({ summary: 'updated' })
      expect(result).toEqual({ summary: 'updated' })
    })
  })

  describe('ListVisitsQuerySchema', () => {
    it('parses defaults', () => {
      const result = ListVisitsQuerySchema.parse({})
      expect(result).toEqual({ page: 1, pageSize: 20 })
    })

    it('filters by projectId', () => {
      const result = ListVisitsQuerySchema.parse({ projectId: 'project_1' })
      expect(result).toEqual({ projectId: 'project_1', page: 1, pageSize: 20 })
    })
  })

  // V6.1 §5.2 节点3：拜访记录录入（三方式，录音非必选，录音须 consent）
  describe('LogVisitSchema', () => {
    it('接受个人复盘（recap）无需 consent', () => {
      const result = LogVisitSchema.parse({
        rawInput: '今天见了李主任，聊了预算和工期，下周给方案',
        rawInputType: 'recap',
      })
      expect(result.rawInputType).toBe('recap')
    })

    it('接受线上会议纪要（meeting）无需 consent', () => {
      const result = LogVisitSchema.parse({
        rawInput: '腾讯会议纪要：参会人……',
        rawInputType: 'meeting',
      })
      expect(result.rawInputType).toBe('meeting')
    })

    it('现场录音（transcript）无 consent 拒绝', () => {
      expect(() =>
        LogVisitSchema.parse({
          rawInput: '录音转写文本……',
          rawInputType: 'transcript',
        })
      ).toThrow(/告知客户/)
    })

    it('现场录音（transcript）带 consent 通过并记录元数据', () => {
      const result = LogVisitSchema.parse({
        rawInput: '录音转写文本……',
        rawInputType: 'transcript',
        audioUrl: 'http://minio/ai-sales/audio/xxx.mp3',
        consentConfirmed: true,
      })
      expect(result.consentConfirmed).toBe(true)
    })

    it('rawInput 为空拒绝', () => {
      expect(() =>
        LogVisitSchema.parse({ rawInput: '', rawInputType: 'note' })
      ).toThrow()
    })

    it('非法 rawInputType 拒绝', () => {
      expect(() =>
        LogVisitSchema.parse({ rawInput: '内容', rawInputType: 'video' })
      ).toThrow()
    })
  })
})
