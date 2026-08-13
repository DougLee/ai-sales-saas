import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { renderMarkdown } from './markdown.js'
import { ENTITY_NAVIGATE_EVENT } from './entity-links.js'

describe('renderMarkdown entity links', () => {
  it('renders entity:// link as a clickable button that dispatches navigation', () => {
    const spy = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true)

    render(<div>{renderMarkdown('请查看 [河南师范大学项目](entity://project/proj_1) 的进展')}</div>)

    const button = screen.getByRole('button', { name: '河南师范大学项目' })
    fireEvent.click(button)

    expect(spy).toHaveBeenCalledTimes(1)
    const event = spy.mock.calls[0][0] as CustomEvent
    expect(event.type).toBe(ENTITY_NAVIGATE_EVENT)
    expect(event.detail).toEqual({ type: 'project', id: 'proj_1' })

    spy.mockRestore()
  })

  it('renders external links as anchor tags, not buttons', () => {
    render(<div>{renderMarkdown('参考 [来源](https://example.com)')}</div>)
    const link = screen.getByRole('link', { name: '来源' })
    expect(link.getAttribute('href')).toBe('https://example.com')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('does not create a button for invalid entity type', () => {
    render(<div>{renderMarkdown('[发票](entity://invoice/1)')}</div>)
    // invalid entity type falls back to an anchor
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('link', { name: '发票' })).toBeDefined()
  })
})
