import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import SupervisionBar from './supervision-bar.js'

type BarProps = Parameters<typeof SupervisionBar>[0]

/** 每个用例独立 props（spy 不跨用例累积）；known 8/20 = 未全量核对的中间态 */
function renderBar(overrides: Partial<BarProps> = {}) {
  const props: BarProps = {
    totalCount: 20,
    knownCount: 8,
    noContactCount: 5,
    noContactActive: false,
    onToggleNoContact: vi.fn(),
    missingDecisionMakerCount: null,
    missingDecisionMakerActive: false,
    onToggleMissingDecisionMaker: vi.fn(),
    checking: false,
    onCheck: vi.fn(),
    ...overrides,
  }
  return { props, ...render(<SupervisionBar {...props} />) }
}

describe('SupervisionBar 角色覆盖督导条', () => {
  it('无联系人格：展示计数，点击切换筛选', () => {
    const { props } = renderBar()
    const tile = screen.getByRole('button', { name: /无联系人客户/ })
    expect(tile.textContent).toContain('5')
    fireEvent.click(tile)
    expect(props.onToggleNoContact).toHaveBeenCalledTimes(1)
  })

  it('缺决策者格：未督导检查时值为 —，点击触发督导检查而非筛选', () => {
    const { props } = renderBar()
    const tile = screen.getByRole('button', { name: /缺决策者客户/ })
    expect(tile.textContent).toContain('—')
    fireEvent.click(tile)
    expect(props.onCheck).toHaveBeenCalledTimes(1)
    expect(props.onToggleMissingDecisionMaker).not.toHaveBeenCalled()
  })

  it('缺决策者格：已核对后展示计数，点击切换筛选', () => {
    const { props } = renderBar({ missingDecisionMakerCount: 3 })
    const tile = screen.getByRole('button', { name: /缺决策者客户/ })
    expect(tile.textContent).toContain('3')
    expect(tile.textContent).toContain('已核对 8/20')
    fireEvent.click(tile)
    expect(props.onToggleMissingDecisionMaker).toHaveBeenCalledTimes(1)
    expect(props.onCheck).not.toHaveBeenCalled()
  })

  it('督导检查按钮：点击批量核对；本页全量核对后禁用', () => {
    const first = renderBar()
    fireEvent.click(screen.getByRole('button', { name: /^督导检查/ }))
    expect(first.props.onCheck).toHaveBeenCalledTimes(1)
    first.unmount()

    const second = renderBar({ knownCount: 20, missingDecisionMakerCount: 3 })
    const btn = screen.getByRole('button', { name: /^本页已全量核对/ }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    expect(second.props.onCheck).not.toHaveBeenCalled()
  })
})
