import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ContactFormDrawer from './contact-form-drawer.js'

function renderForm(props: Partial<Parameters<typeof ContactFormDrawer>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ContactFormDrawer
        open
        onClose={() => {}}
        lockedCompany={{ id: 'c1', name: '测试客户' }}
        {...props}
      />
    </QueryClientProvider>,
  )
}

describe('ContactFormDrawer 合一表单（issue #43）', () => {
  it('从客户条带打开：所属客户锁定展示，禁止再选（无客户下拉）', async () => {
    renderForm()
    expect(await screen.findByText('为「测试客户」添加联系人')).toBeTruthy()
    expect(screen.getByText('测试客户')).toBeTruthy()
    expect(screen.getByText(/已锁定/)).toBeTruthy()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('决策角色色块五选一：四角色 + 待定，可切换', async () => {
    renderForm()
    await screen.findByText(/决策角色/)

    const dm = screen.getByRole('button', { name: '决策者' })
    expect(dm.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(dm)
    expect(dm.getAttribute('aria-pressed')).toBe('true')
    // 待定 = 清除标注
    fireEvent.click(screen.getByRole('button', { name: '待定' }))
    expect(dm.getAttribute('aria-pressed')).toBe('false')
  })

  it('defaultRole 预选：缺决策者预警一键补录场景', async () => {
    renderForm({ defaultRole: 'DECISION_MAKER' })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '决策者' }).getAttribute('aria-pressed')).toBe('true')
    })
  })

  it('打单情报四字段显性化', async () => {
    renderForm()
    expect(await screen.findByText(/打单情报/)).toBeTruthy()
    expect(screen.getByPlaceholderText(/个人动机/)).toBeTruthy()
    expect(screen.getByPlaceholderText(/关注点/)).toBeTruthy()
    expect(screen.getByPlaceholderText(/如何触达/)).toBeTruthy()
    expect(screen.getByPlaceholderText(/如何说服/)).toBeTruthy()
  })
})
