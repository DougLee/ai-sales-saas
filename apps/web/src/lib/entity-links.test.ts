import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseEntityUrl,
  entityRouteTo,
  dispatchEntityNavigate,
  ENTITY_NAVIGATE_EVENT,
} from './entity-links.js'

describe('parseEntityUrl', () => {
  it('parses a valid project entity url', () => {
    expect(parseEntityUrl('entity://project/proj_123')).toEqual({ type: 'project', id: 'proj_123' })
  })

  it('parses all supported entity types', () => {
    expect(parseEntityUrl('entity://lead/l1')?.type).toBe('lead')
    expect(parseEntityUrl('entity://customer/c1')?.type).toBe('customer')
    expect(parseEntityUrl('entity://visit/v1')?.type).toBe('visit')
    expect(parseEntityUrl('entity://task/t1')?.type).toBe('task')
    expect(parseEntityUrl('entity://contact/ct1')?.type).toBe('contact')
  })

  it('returns null for non-entity urls', () => {
    expect(parseEntityUrl('https://example.com')).toBeNull()
    expect(parseEntityUrl('/projects?id=1')).toBeNull()
  })

  it('returns null for unknown entity type', () => {
    expect(parseEntityUrl('entity://invoice/123')).toBeNull()
  })

  it('returns null when id is missing', () => {
    expect(parseEntityUrl('entity://project/')).toBeNull()
    expect(parseEntityUrl('entity://project')).toBeNull()
  })

  it('keeps ids containing slashes after the first segment', () => {
    expect(parseEntityUrl('entity://project/a/b')).toEqual({ type: 'project', id: 'a/b' })
  })
})

describe('entityRouteTo', () => {
  it('maps types to list routes with id query', () => {
    expect(entityRouteTo('project', 'p1')).toEqual({ pathname: '/projects', search: '?id=p1' })
    expect(entityRouteTo('customer', 'c1')).toEqual({ pathname: '/customers', search: '?id=c1' })
  })

  it('encodes special characters in id', () => {
    expect(entityRouteTo('lead', 'a b').search).toBe('?id=a%20b')
  })
})

describe('dispatchEntityNavigate', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('dispatches an entity-navigate custom event with the ref', () => {
    const spy = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true)
    dispatchEntityNavigate({ type: 'visit', id: 'v9' })
    expect(spy).toHaveBeenCalledTimes(1)
    const event = spy.mock.calls[0][0] as CustomEvent
    expect(event.type).toBe(ENTITY_NAVIGATE_EVENT)
    expect(event.detail).toEqual({ type: 'visit', id: 'v9' })
  })
})
