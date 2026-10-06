import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { RxStorage } from 'rxdb'
import { useAuth } from '../auth/AuthContext'
import { closeUserDatabases, openUserDatabase, type TransactionCollection } from '../lib/db'
import { createSyncController, type SyncController } from '../lib/sync'

interface DataContextValue {
  transactions: TransactionCollection | null
  sync: SyncController | null
  error: string | null
}

const EMPTY: DataContextValue = { transactions: null, sync: null, error: null }

export const DataContext = createContext<DataContextValue>(EMPTY)

/**
 * Opens the signed-in user's encrypted local database and keeps it in sync:
 * once on start (if online) and again on every browser `online` event.
 */
export function DataProvider({
  children,
  storage,
}: {
  children: ReactNode
  storage?: RxStorage<unknown, unknown>
}) {
  const { user, token, encryptionKey } = useAuth()
  const [value, setValue] = useState<DataContextValue>(EMPTY)
  const userId = user?.id ?? null

  useEffect(() => {
    if (!userId || !token || !encryptionKey) {
      void closeUserDatabases()
      return
    }
    const session = { userId, token, encryptionKey }

    let cancelled = false
    let controller: SyncController | null = null
    const handleOnline = () => void controller?.trigger()
    const handleOffline = () => controller?.markOffline()

    async function open() {
      try {
        const db = await openUserDatabase(session.userId, session.encryptionKey, storage)
        if (cancelled) return
        controller = createSyncController({
          collection: db.transactions,
          token: session.token,
        })
        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)
        setValue({ transactions: db.transactions, sync: controller, error: null })
        if (navigator.onLine) void controller.trigger()
      } catch {
        if (!cancelled) setValue({ ...EMPTY, error: 'Could not open local data' })
      }
    }

    void open()

    return () => {
      cancelled = true
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      void controller?.dispose()
      setValue(EMPTY)
    }
  }, [userId, token, encryptionKey, storage])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextValue {
  return useContext(DataContext)
}
