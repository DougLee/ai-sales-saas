import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AiEntryButton from './ai-entry-button.js'

describe('AiEntryButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders primary variant with label', () => {
    render(
      <MemoryRouter>
        <AiEntryButton prompt="hello" label="问小销" variant="primary" />
      </MemoryRouter>,
    )
    const button = screen.getByRole('button', { name: /问小销/ })
    expect(button).toBeDefined()
  })

  it('renders icon-only mode', () => {
    render(
      <MemoryRouter>
        <AiEntryButton prompt="hello" iconOnly variant="ghost" />
      </MemoryRouter>,
    )
    const button = screen.getByRole('button')
    expect(button.textContent).toBe('')
  })

  it('navigates with entity context and dispatches prompt event', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true)

    render(
      <MemoryRouter initialEntries={['/projects']}>
        <AiEntryButton
          prompt="分析这个商机"
          label="问小销"
          entityType="project"
          entityId="proj_123"
        />
      </MemoryRouter>,
    )

    const button = screen.getByRole('button', { name: /问小销/ })
    fireEvent.click(button)

    await waitFor(() => {
      expect(dispatchSpy).toHaveBeenCalledTimes(1)
    })
    const event = dispatchSpy.mock.calls[0][0] as CustomEvent
    expect(event.type).toBe('ai-copilot-prompt')
    expect(event.detail).toBe('分析这个商机')

    dispatchSpy.mockRestore()
  })

  it('does not add entity query params when entity is missing', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true)

    render(
      <MemoryRouter initialEntries={['/projects']}>
        <AiEntryButton prompt="列表级问题" label="问小销" />
      </MemoryRouter>,
    )

    const button = screen.getByRole('button', { name: /问小销/ })
    fireEvent.click(button)

    await waitFor(() => {
      expect(dispatchSpy).toHaveBeenCalledTimes(1)
    })

    dispatchSpy.mockRestore()
  })
})
