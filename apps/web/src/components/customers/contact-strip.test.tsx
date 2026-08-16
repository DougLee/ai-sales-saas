import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ContactStrip from './contact-strip.js'
import type { CompanyDetail } from '../../hooks/use-companies.js'

/** 条带测试用的客户详情（detail 接口已带 contacts + decisionRole） */
function detailOf(overrides: Partial<CompanyDetail> = {}): CompanyDetail {
  return {
    company: { id: 'c1', name: '测试客户' },
    contacts: [
      { id: 'ct1', name: '张三', department: '信息中心', position: '主任', phone: '13800000001', decisionRole: 'DECISION_MAKER' },
      { id: 'ct2', name: '李四', position: '老师', decisionRole: 'COACH' },
    ],
    _readonly: false,
    ...overrides,
  } as unknown as CompanyDetail
}

const useCompanyMock = vi.fn()

vi.mock('../../hooks/use-companies.js', () => ({
  useCompany: (id?: string) => useCompanyMock(id),
}))

function renderStrip(props: Partial<Parameters<typeof ContactStrip>[0]> = {}) {
  return render(
    <ContactStrip
      companyId="c1"
      companyName="测试客户"
      open
      onAddContact={vi.fn()}
      onLoaded={vi.fn()}
      {...props}
    />,
  )
}

describe('ContactStrip 联系人条带', () => {
  it('渲染角色徽章（五角色色系）+ 姓名 + 部门职位 + tel 链接', () => {
    useCompanyMock.mockReturnValue({ data: detailOf(), isLoading: false })
    renderStrip()

    expect(screen.getByText('决策者')).toBeTruthy()
    expect(screen.getByText('切入者')).toBeTruthy()
    expect(screen.getByText('张三')).toBeTruthy()
    expect(screen.getByText('信息中心 · 主任')).toBeTruthy()
    const tel = screen.getByRole('link', { name: /拨打 13800000001/ }) as HTMLAnchorElement
    expect(tel.getAttribute('href')).toBe('tel:13800000001')
  })

  it('缺关键角预警：缺影响力者，点击带角色预选补录', () => {
    const onAddContact = vi.fn()
    useCompanyMock.mockReturnValue({ data: detailOf(), isLoading: false })
    renderStrip({ onAddContact })

    const warn = screen.getByText(/缺影响力者/)
    expect(warn).toBeTruthy()
    // 该客户已有决策者，预警补录应预选影响力者
    fireEvent.click(warn)
    expect(onAddContact).toHaveBeenCalledWith('EVALUATOR')
  })

  it('无联系人：整行引导「录入第一位联系人」，点击打开合一表单', () => {
    const onAddContact = vi.fn()
    useCompanyMock.mockReturnValue({ data: detailOf({ contacts: [] }), isLoading: false })
    renderStrip({ onAddContact })

    const btn = screen.getByText('＋ 录入第一位联系人')
    fireEvent.click(btn)
    expect(onAddContact).toHaveBeenCalled()
  })

  it('有「＋ 添加联系人」入口，缺决策者时预警点击预选 DECISION_MAKER', () => {
    const onAddContact = vi.fn()
    useCompanyMock.mockReturnValue({
      data: detailOf({
        contacts: [{ id: 'ct2', name: '李四', decisionRole: 'COACH' }] as CompanyDetail['contacts'],
      }),
      isLoading: false,
    })
    renderStrip({ onAddContact })

    fireEvent.click(screen.getByText(/缺决策者、影响力者/))
    expect(onAddContact).toHaveBeenCalledWith('DECISION_MAKER')
    fireEvent.click(screen.getByText('＋ 添加联系人'))
    // 无角色预选的普通添加（零参调用）
    expect(onAddContact).toHaveBeenLastCalledWith()
  })

  it('详情数据到达后向父级登记（两层筛选/督导统计用）', async () => {
    const onLoaded = vi.fn()
    useCompanyMock.mockReturnValue({ data: detailOf(), isLoading: false })
    renderStrip({ onLoaded })

    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith('c1', detailOf().contacts, false))
  })

  it('SALES 只读详情：不展示联系人，登记为 readonly', async () => {
    const onLoaded = vi.fn()
    useCompanyMock.mockReturnValue({
      data: detailOf({ contacts: [], _readonly: true }),
      isLoading: false,
    })
    renderStrip({ onLoaded })

    expect(screen.getByText(/其他同事负责/)).toBeTruthy()
    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith('c1', [], true))
  })
})
