import { test, expect } from '@playwright/test'

test.describe('Alerts API', () => {
  test('GET /api/alerts returns scan result', async ({ request }) => {
    const response = await request.get('/api/alerts')
    expect([200, 401, 403]).toContain(response.status())
    if (response.ok()) {
      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.data).toHaveProperty('totalAlerts')
      expect(body.data).toHaveProperty('alerts')
      expect(body.data).toHaveProperty('summary')
      expect(body.data).toHaveProperty('scanTime')
    }
  })

  test('POST /api/alerts/scan triggers manual scan', async ({ request }) => {
    const response = await request.post('/api/alerts/scan')
    expect([200, 401, 403]).toContain(response.status())
    if (response.ok()) {
      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.data).toHaveProperty('jobId')
      expect(body.data.message).toContain('扫描')
    }
  })
})
