import { vi } from 'vitest'
import { BehaviorSubject } from 'rxjs'
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory'
import { createValoraDatabase, type TransactionDoc } from '../lib/db'
import type { SyncController, SyncStatus } from '../lib/sync'

/** A real (in-memory, encrypted) local database plus a fake sync controller. */
export async function createTestData() {
  const db = await createValoraDatabase({
    name: `test-${crypto.randomUUID()}`,
    encryptionKey: 'k'.repeat(64),
    storage: getRxStorageMemory(),
  })
  const sync: SyncController = {
    status$: new BehaviorSubject<SyncStatus>('online'),
    trigger: vi.fn().mockResolvedValue(undefined),
    markOffline: vi.fn(),
    dispose: vi.fn().mockResolvedValue(undefined),
  }
  return {
    db,
    sync,
    value: { transactions: db.transactions, sync, error: null },
  }
}

export function transactionDoc(overrides: Partial<TransactionDoc> = {}): TransactionDoc {
  return {
    id: crypto.randomUUID(),
    accountId: 'acc-1',
    description: null,
    value: 1000,
    type: 'DEBIT',
    paymentMethod: 'PIX',
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  }
}
