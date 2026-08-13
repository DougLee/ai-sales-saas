import { useCallback, useEffect, useRef, useState } from 'react'

const DB_NAME = 'ai-sales-offline'
const DB_VERSION = 1
const STORE_NAME = 'pending-transcripts'

export interface PendingTranscript {
  id: string
  projectId?: string
  blob: Blob
  createdAt: number
  retryCount: number
}

interface StoredTranscript {
  id: string
  projectId?: string
  blob: Blob
  createdAt: number
  retryCount: number
}

function generateId(): string {
  return `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported in this environment'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
  })
}

export async function cacheOfflineTranscript(
  db: IDBDatabase,
  projectId: string | undefined,
  blob: Blob
): Promise<string> {
  const id = generateId()
  const item: StoredTranscript = {
    id,
    projectId,
    blob,
    createdAt: Date.now(),
    retryCount: 0,
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.put(item)

    request.onsuccess = () => resolve(id)
    request.onerror = () => reject(request.error)
  })
}

export async function getPendingQueue(db: IDBDatabase): Promise<PendingTranscript[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onsuccess = () => {
      const items = (request.result as StoredTranscript[]).sort(
        (a, b) => a.createdAt - b.createdAt
      )
      resolve(items)
    }
    request.onerror = () => reject(request.error)
  })
}

export async function removeFromQueue(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.delete(id)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function syncPendingQueue(
  db: IDBDatabase,
  uploadFn: (item: PendingTranscript) => Promise<void>
): Promise<void> {
  const queue = await getPendingQueue(db)
  if (queue.length === 0) return

  console.log(`[IndexedDB] Syncing ${queue.length} pending transcripts...`)

  for (const item of queue) {
    try {
      await uploadFn(item)
      await removeFromQueue(db, item.id)
    } catch (err) {
      console.error(`[IndexedDB] Failed to sync transcript ${item.id}:`, err)
    }
  }
}

export function useIndexedDB() {
  const [isSupported, setIsSupported] = useState(false)
  const dbRef = useRef<IDBDatabase | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      return
    }
    setIsSupported(true)

    openDB()
      .then((db) => {
        dbRef.current = db
      })
      .catch((err) => {
        console.error('[IndexedDB] Failed to open:', err)
      })

    return () => {
      dbRef.current?.close()
    }
  }, [])

  const cache = useCallback(
    async (projectId: string | undefined, blob: Blob): Promise<string> => {
      const db = dbRef.current || (await openDB())
      return cacheOfflineTranscript(db, projectId, blob)
    },
    []
  )

  const getQueue = useCallback(async (): Promise<PendingTranscript[]> => {
    const db = dbRef.current || (await openDB())
    return getPendingQueue(db)
  }, [])

  const remove = useCallback(async (id: string): Promise<void> => {
    const db = dbRef.current || (await openDB())
    return removeFromQueue(db, id)
  }, [])

  const sync = useCallback(
    async (uploadFn: (item: PendingTranscript) => Promise<void>): Promise<void> => {
      const db = dbRef.current || (await openDB())
      return syncPendingQueue(db, uploadFn)
    },
    []
  )

  return {
    isSupported,
    cacheOfflineTranscript: cache,
    getPendingQueue: getQueue,
    removeFromQueue: remove,
    syncPendingQueue: sync,
  }
}

/**
 * 全局网络恢复监听器
 * 当网络恢复时自动调用同步函数
 */
export function useNetworkRecovery(syncFn: () => Promise<void>) {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleOnline = () => {
      console.log('[Network] Recovered, starting offline sync...')
      syncFn().catch((err) => {
        console.error('[Network] Auto sync failed:', err)
      })
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [syncFn])
}
