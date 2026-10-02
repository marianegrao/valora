import { BehaviorSubject, firstValueFrom, type Observable } from 'rxjs'
import { replicateRxCollection } from 'rxdb/plugins/replication'
import type { TransactionCollection, TransactionDoc } from './db'

export type SyncStatus = 'online' | 'offline'

interface Checkpoint {
  id: string
  serverUpdatedAt: number
}

export interface SyncController {
  /** Binary connectivity as seen by replication, not navigator.onLine. */
  status$: Observable<SyncStatus>
  /** Runs one push+pull cycle; a trigger during a run queues one more. */
  trigger: () => Promise<void>
  markOffline: () => void
  dispose: () => Promise<void>
}

const REPLICATION_IDENTIFIER = 'valora-transactions'
const PULL_BATCH_SIZE = 100

export function createSyncController({
  collection,
  token,
  apiUrl = import.meta.env.VITE_API_URL,
  replicate = replicateRxCollection,
}: {
  collection: TransactionCollection
  token: string
  apiUrl?: string
  replicate?: typeof replicateRxCollection
}): SyncController {
  const status$ = new BehaviorSubject<SyncStatus>('offline')
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
  let running: Promise<void> | null = null
  let rerun = false
  let disposed = false
  let cancelCurrent: (() => Promise<void>) | null = null

  async function pull(checkpoint: Checkpoint | undefined, batchSize: number) {
    const params = new URLSearchParams({ batchSize: String(batchSize) })
    if (checkpoint) {
      params.set('id', checkpoint.id)
      params.set('serverUpdatedAt', String(checkpoint.serverUpdatedAt))
    }
    const response = await fetch(`${apiUrl}/sync/transactions/pull?${params}`, {
      method: 'GET',
      headers,
    })
    if (!response.ok) throw new Error(`Sync pull failed (${response.status})`)
    const body = await response.json()
    return { documents: body.documents, checkpoint: body.checkpoint ?? undefined }
  }

  async function push(rows: unknown[]) {
    const response = await fetch(`${apiUrl}/sync/transactions/push`, {
      method: 'POST',
      headers,
      body: JSON.stringify(rows),
    })
    if (!response.ok) throw new Error(`Sync push failed (${response.status})`)
    return response.json()
  }

  /**
   * One push+pull cycle. RxDB retries failed handlers forever, so the
   * first error ends the cycle and flips the status to offline; the next
   * trigger (app start, `online` event, local write) tries again.
   *
   * This runs a live replication and cancels it once in sync, rather than
   * using live: false: a non-live start() awaits an in-sync state that a
   * failing handler never reaches, and cancel() (also run when the
   * collection closes) is queued behind start(), so it would hang.
   */
  async function runOnce() {
    const replication = replicate<TransactionDoc, Checkpoint>({
      collection,
      replicationIdentifier: REPLICATION_IDENTIFIER,
      live: true,
      pull: { handler: pull, batchSize: PULL_BATCH_SIZE },
      push: { handler: push },
    })
    cancelCurrent = () => replication.cancel()
    let failed = false
    const firstError = firstValueFrom(replication.error$).then(
      () => {
        failed = true
      },
      () => undefined, // error$ completes without emitting on cancel
    )
    await Promise.race([replication.awaitInSync(), firstError])
    await replication.cancel()
    cancelCurrent = null
    if (!disposed) status$.next(failed ? 'offline' : 'online')
  }

  function trigger(): Promise<void> {
    if (disposed) return Promise.resolve()
    if (running) {
      rerun = true
      return running
    }
    running = (async () => {
      do {
        rerun = false
        try {
          await runOnce()
        } catch {
          // Surfaced through the badge; callers fire-and-forget trigger().
          cancelCurrent = null
          if (!disposed) status$.next('offline')
        }
      } while (rerun && !disposed)
    })().finally(() => {
      running = null
    })
    return running
  }

  return {
    status$: status$.asObservable(),
    trigger,
    markOffline: () => status$.next('offline'),
    async dispose() {
      disposed = true
      await cancelCurrent?.()
      await running
      status$.complete()
    },
  }
}
