import { test, expect } from '@playwright/test'

test.describe('Health API', () => {
  test('GET /health returns ok', async ({ request }) => {
    const response = await request.get('/health')
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.status).toBe('ok')
    expect(body.version).toBe('2.3.0')
  })
})
