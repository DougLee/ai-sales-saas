import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Projects from './projects.js'
import type { Project } from '../hooks/use-projects.js'

const PROJECT = {
  id: 'p1',
  name: '测试商机',
  urgency: 'HIGH',
  milestone: 0,
  status: 'FOLLOWING',
  company: { id: 'c1', name: '测试客户' },
} as unknown as Project

const DETAIL = {
  ...PROJECT,
  industry: 'education',
  amount: 50,
  healthScore: 18,
} as unknown as Project

vi.mock('../hooks/use-projects.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/use-projects.js')>()
  return {
    ...actual,
    useProjects: () => ({ data: { items: [PROJECT], total: 1 }, isLoading: false, error: null }),
    useProject: (id?: string) => ({ data: id ? DETAIL : undefined }),
    useDeleteProject: () => ({ mutate: vi.fn(), isPending: false }),
    useUpdateProject: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  }
})
vi.mock('../hooks/use-decision-chain.js', () => ({
  useDecisionChain: () => ({ data: undefined }),
  useUpdateDecisionChain: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('../components/projects/waiting-section.js', () => ({ default: () => null }))
vi.mock('../components/projects/decision-chain-map.js', () => ({ DecisionChainMap: () => null }))
vi.mock('../components/timeline/timeline-view.js', () => ({ TimelineView: () => null }))
vi.mock('../components/forms/project-form.js', () => ({ default: () => null }))
vi.mock('../components/forms/visit-form.js', () => ({ default: () => null }))
vi.mock('../components/ai/ai-entry-button.js', () => ({ default: () => null }))

function renderProjects(initialEntry = '/projects') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Projects />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('商机详情 Drawer 关闭', () => {
  it('点击卡片打开后，点 X 关闭', async () => {
    renderProjects()
    fireEvent.click(await screen.findByText('测试商机'))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('关闭'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('深链 ?id= 打开后，点 X 关闭且不复活', async () => {
    renderProjects('/projects?id=p1')
    expect(await screen.findByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('关闭'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // 等待可能的 effect 链结束后仍保持关闭
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
