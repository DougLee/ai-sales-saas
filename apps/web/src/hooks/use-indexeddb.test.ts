import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  cacheOfflineTranscript,
  getPendingQueue,
  removeFromQueue,
  syncPendingQueue,
} from './use-indexeddb'

// Minimal mock of IDBDatabase + IDBObjectStore for unit testing
function createMockDB() {
  const store = new Map<string, unknown>()

  const mockObjectStore = {
    put: (item: Record<string, unknown>) => {
      store.set(item.id as string, item)
      const req = { onsuccess: null as ((e: Event) => void) | null, result: undefined }
      queueMicrotask(() => req.onsuccess?.(new Event('success')))
      return req as unknown as IDBRequest
    },
    getAll: () => {
      const req = {
        onsuccess: null as ((e: Event) => void) | null,
        result: Array.from(store.values()),
      }
      queueMicrotask(() => req.onsuccess?.(new Event('success')))
      return req as unknown as IDBRequest
    },
    delete: (id: string) => {
      store.delete(id)
      const req = { onsuccess: null as ((e: Event) => void) | null }
      queueMicrotask(() => req.onsuccess?.(new Event('success')))
      return req as unknown as IDBRequest
    },
  }

  const mockDB = {
    transaction: () => ({
      objectStore: () => mockObjectStore,
    }),
    close: vi.fn(),
  }

  return { mockDB: mockDB as unknown as IDBDatabase, store }
}

describe('indexeddb core functions', () => {
  let mockDB: IDBDatabase

  beforeEach(() => {
    mockDB = createMockDB().mockDB
  })

  it('should cache offline transcript', async () => {
    const blob = new Blob(['test audio'], { type: 'audio/webm' })
    const id = await cacheOfflineTranscript(mockDB, 'project_1', blob)

    expect(id).toMatch(/^offline_\d+_/)

    const queue = await getPendingQueue(mockDB)
    expect(queue).toHaveLength(1)
    expect(queue[0].projectId).toBe('project_1')
    expect(queue[0].blob.size).toBe(blob.size)
  })

  it('should return queue sorted by createdAt', async () => {
    const blob = new Blob(['test audio'], { type: 'audio/webm' })
    await cacheOfflineTranscript(mockDB, 'project_1', blob)
    await new Promise((resolve) => setTimeout(resolve, 10))
    await cacheOfflineTranscript(mockDB, 'project_2', blob)

    const queue = await getPendingQueue(mockDB)
    expect(queue).toHaveLength(2)
    expect(queue[0].projectId).toBe('project_1')
    expect(queue[1].projectId).toBe('project_2')
  })

  it('should remove item from queue', async () => {
    const blob = new Blob(['test audio'], { type: 'audio/webm' })
    const id = await cacheOfflineTranscript(mockDB, 'project_1', blob)

    await removeFromQueue(mockDB, id)

    const queue = await getPendingQueue(mockDB)
    expect(queue).toHaveLength(0)
  })

  it('should sync pending queue and remove successful items', async () => {
    const blob = new Blob(['test audio'], { type: 'audio/webm' })
    await cacheOfflineTranscript(mockDB, 'project_1', blob)

    const uploadFn = vi.fn().mockResolvedValue(undefined)
    await syncPendingQueue(mockDB, uploadFn)

    expect(uploadFn).toHaveBeenCalledTimes(1)
    expect(uploadFn.mock.calls[0][0]).toMatchObject({
      projectId: 'project_1',
      retryCount: 0,
    })

    const queue = await getPendingQueue(mockDB)
    expect(queue).toHaveLength(0)
  })

  it('should keep failed items in queue for retry', async () => {
    const blob = new Blob(['test audio'], { type: 'audio/webm' })
    await cacheOfflineTranscript(mockDB, 'project_1', blob)

    const uploadFn = vi.fn().mockRejectedValue(new Error('Upload failed'))
    await syncPendingQueue(mockDB, uploadFn)

    const queue = await getPendingQueue(mockDB)
    expect(queue).toHaveLength(1)
  })
})
