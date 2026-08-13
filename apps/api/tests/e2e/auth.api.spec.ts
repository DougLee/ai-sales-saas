import { test, expect } from '@playwright/test'

test.describe('Auth API', () => {
  test('POST /api/auth/register creates a user', async ({ request }) => {
    const email = `e2e-${Date.now()}@test.com`
    const response = await request.post('/api/auth/register', {
      data: { email, password: 'password123', name: 'E2E Test' },
    })
    expect([200, 201, 409]).toContain(response.status())
  })

  test('POST /api/auth/login with wrong password returns 401', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      data: { email: 'nonexistent@test.com', password: 'wrong' },
    })
    expect(response.status()).toBe(401)
  })
})
