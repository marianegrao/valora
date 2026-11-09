import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { firstValueFrom } from 'rxjs'
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory'
import { createValoraDatabase, type TransactionDoc, type ValoraDatabase } from './db'
import { createSyncController, type SyncController } from './sync'

function transaction(overrides: Partial<TransactionDoc> = {}): TransactionDoc {
  return {
    id: crypto.randomUUID(),
    accountId: 'acc-1',
    description: 'Groceries',
    value: 4599,
    type: 'DEBIT',
    paymentMethod: 'PIX',
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  }
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Fake backend: accepts every push, serves `serverDocs` on the first pull. */
function fakeServer(serverDocs: unknown[] = []) {
  const pushed: unknown[] = []
  let served = false
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/sync/transactions/push')) {
      pushed.push(...JSON.parse(String(init?.body)))
      return json([])
    }
    const documents = served ? [] : serverDocs
    served = true
    return json({
      documents,
      checkpoint: documents.length ? { id: 'cp', serverUpdatedAt: 1 } : null,
    })
  })
  return { fetchMock, pushed }
}

describe('createSyncController', () => {
  let db: ValoraDatabase
  let controller: SyncController

  beforeEach(async () => {
    db = await createValoraDatabase({
      name: `test-${crypto.randomUUID()}`,
      encryptionKey: 'k'.repeat(64),
      storage: getRxStorageMemory(),
    })
    controller = createSyncController({
      collection: db.transactions,
      token: 'token-123',
      apiUrl: 'http://api.test',
    })
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await controller.dispose()
    await db.close()
  })

  it('starts offline until a sync succeeds', async () => {
    expect(await firstValueFrom(controller.status$)).toBe('offline')
  })

  it('pushes local transactions with the bearer token and goes online', async () => {
    const { fetchMock, pushed } = fakeServer()
    vi.stubGlobal('fetch', fetchMock)
    const doc = transaction()
    await db.transactions.insert(doc)

    await controller.trigger()

    expect(pushed).toEqual([
      expect.objectContaining({
        newDocumentState: expect.objectContaining({ ...doc, _deleted: false }),
      }),
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/sync/transactions/push',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
      }),
    )
    expect(await firstValueFrom(controller.status$)).toBe('online')
  })

  it('pulls server transactions into the local collection', async () => {
    const serverDoc = { ...transaction({ value: 777 }), _deleted: false }
    const { fetchMock } = fakeServer([serverDoc])
    vi.stubGlobal('fetch', fetchMock)

    await controller.trigger()

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('http://api.test/sync/transactions/pull?batchSize='),
      expect.anything(),
    )
    const local = await db.transactions.findOne(serverDoc.id).exec()
    expect(local?.value).toBe(777)
  })

  it('goes offline and stops when the server cannot be reached', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    await db.transactions.insert(transaction())

    await controller.trigger()

    expect(await firstValueFrom(controller.status$)).toBe('offline')
    const callsAfterRun = fetchMock.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fetchMock.mock.calls.length).toBe(callsAfterRun)
  })

  it('runs once more when triggered while a sync is in progress', async () => {
    const { fetchMock } = fakeServer()
    vi.stubGlobal('fetch', fetchMock)

    const first = controller.trigger()
    const second = controller.trigger()
    await Promise.all([first, second])
    await db.transactions.insert(transaction())
    await controller.trigger()

    const pullCalls = fetchMock.mock.calls.filter(([url]) => url.includes('/pull'))
    expect(pullCalls.length).toBeGreaterThanOrEqual(2)
    expect(await firstValueFrom(controller.status$)).toBe('online')
  })

  it('never rejects, reporting offline when a sync cannot even start', async () => {
    const broken = createSyncController({
      collection: db.transactions,
      token: 'token-123',
      apiUrl: 'http://api.test',
      replicate: () => {
        throw new Error('replication setup failed')
      },
    })

    await expect(broken.trigger()).resolves.toBeUndefined()
    expect(await firstValueFrom(broken.status$)).toBe('offline')
    await broken.dispose()
  })

  it('can be marked offline explicitly', async () => {
    vi.stubGlobal('fetch', fakeServer().fetchMock)
    await controller.trigger()

    controller.markOffline()

    expect(await firstValueFrom(controller.status$)).toBe('offline')
  })
})
