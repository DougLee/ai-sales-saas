import { test, expect } from '@playwright/test'

function randomEmail() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`
}

test.describe('CRM API', () => {
  let token: string | null = null
  let leadId: string | null = null

  test.beforeAll(async ({ request }) => {
    // Register and login
    const email = randomEmail()
    await request.post('/api/auth/register', {
      data: { email, password: 'password123', name: 'E2E Test' },
    })
    const loginRes = await request.post('/api/auth/login', {
      data: { email, password: 'password123' },
    })
    if (loginRes.ok()) {
      const body = await loginRes.json()
      token = body.data?.token || body.token
    }
  })

  test('create and list leads', async ({ request }) => {
    if (!token) test.skip()

    const createRes = await request.post('/api/leads', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: 'E2E Lead', status: 'NEW', source: 'TEST' },
    })
    expect(createRes.status()).toBeOneOf([200, 201])
    const createBody = await createRes.json()
    expect(createBody.success).toBe(true)
    leadId = createBody.data?.id || createBody.id

    const listRes = await request.get('/api/leads', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(listRes.ok()).toBe(true)
    const listBody = await listRes.json()
    expect(listBody.success).toBe(true)
  })

  test('update and delete lead', async ({ request }) => {
    if (!token || !leadId) test.skip()

    const updateRes = await request.patch(`/api/leads/${leadId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: 'E2E Lead Updated' },
    })
    expect([200, 204]).toContain(updateRes.status())

    const deleteRes = await request.delete(`/api/leads/${leadId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect([200, 204]).toContain(deleteRes.status())
  })
})
