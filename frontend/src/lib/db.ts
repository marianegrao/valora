import {
  createRxDatabase,
  type RxCollection,
  type RxConflictHandler,
  type RxDatabase,
  type RxJsonSchema,
  type RxStorage,
} from 'rxdb'
import { wrappedKeyEncryptionCryptoJsStorage } from 'rxdb/plugins/encryption-crypto-js'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'
import { deepEqual } from 'rxdb/plugins/utils'
import type { PaymentMethod, TransactionType } from './apiClient'

/**
 * Local shape of a Transaction; mirrors the backend sync wire format.
 * Timestamps are epoch milliseconds. `updatedAt` is the time of the last
 * local edit and decides last-write-wins conflicts.
 */
export interface TransactionDoc {
  id: string
  accountId: string
  description: string | null
  value: number
  type: TransactionType
  paymentMethod: PaymentMethod
  createdAt: number
  updatedAt: number
}

export type TransactionCollection = RxCollection<TransactionDoc>
export type ValoraDatabase = RxDatabase<{ transactions: TransactionCollection }>

export const transactionSchema: RxJsonSchema<TransactionDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 36 },
    accountId: { type: 'string' },
    description: { type: ['string', 'null'] },
    value: { type: 'integer' },
    type: { type: 'string', enum: ['DEBIT', 'CREDIT'] },
    paymentMethod: {
      type: 'string',
      enum: ['PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CASH'],
    },
    createdAt: { type: 'integer' },
    updatedAt: { type: 'integer' },
  },
  required: [
    'id',
    'accountId',
    'value',
    'type',
    'paymentMethod',
    'createdAt',
    'updatedAt',
  ],
  encrypted: ['description', 'value'],
}

/** On conflict, the state with the newer updatedAt wins; ties keep the server's. */
export const lastWriteWins: RxConflictHandler<TransactionDoc> = {
  isEqual: (a, b) => deepEqual(a, b),
  resolve: async ({ newDocumentState, realMasterState }) =>
    newDocumentState.updatedAt > realMasterState.updatedAt
      ? newDocumentState
      : realMasterState,
}

export async function createValoraDatabase({
  name,
  encryptionKey,
  storage = getRxStorageDexie(),
}: {
  name: string
  encryptionKey: string
  storage?: RxStorage<unknown, unknown>
}): Promise<ValoraDatabase> {
  const db = await createRxDatabase<{ transactions: TransactionCollection }>({
    name,
    storage: wrappedKeyEncryptionCryptoJsStorage({ storage }),
    password: encryptionKey,
  })
  try {
    await db.addCollections({
      transactions: { schema: transactionSchema, conflictHandler: lastWriteWins },
    })
  } catch (err) {
    await db.close()
    throw err
  }
  return db
}

/**
 * Open databases keyed by user, so React StrictMode's double-mounted
 * effects reuse one instance instead of racing to open the same name twice.
 */
const userDatabases = new Map<string, Promise<ValoraDatabase>>()

export function openUserDatabase(
  userId: string,
  encryptionKey: string,
  storage?: RxStorage<unknown, unknown>,
): Promise<ValoraDatabase> {
  const existing = userDatabases.get(userId)
  if (existing) return existing

  const opening = createValoraDatabase({
    name: `valora-${userId.toLowerCase()}`,
    encryptionKey,
    storage,
  })
  userDatabases.set(userId, opening)
  opening.catch(() => userDatabases.delete(userId))
  return opening
}

export async function closeUserDatabases(): Promise<void> {
  const opening = [...userDatabases.values()]
  userDatabases.clear()
  const results = await Promise.allSettled(opening)
  await Promise.all(
    results.map((result) =>
      result.status === 'fulfilled' ? result.value.close() : undefined,
    ),
  )
}
