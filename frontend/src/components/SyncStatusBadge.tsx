import { useEffect, useState } from 'react'
import { useData } from '../data/DataContext'
import type { SyncStatus } from '../lib/sync'

/** Online/offline as reported by replication, not by navigator.onLine. */
export function SyncStatusBadge() {
  const { sync } = useData()
  const [status, setStatus] = useState<SyncStatus>('offline')

  useEffect(() => {
    if (!sync) return
    const subscription = sync.status$.subscribe(setStatus)
    return () => subscription.unsubscribe()
  }, [sync])

  if (!sync) return null

  const isOnline = status === 'online'
  return (
    <span
      role="status"
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        isOnline ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'
      }`}
    >
      {isOnline ? 'Online' : 'Offline'}
    </span>
  )
}
