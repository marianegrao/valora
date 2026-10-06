import { afterEach, describe, expect, it } from 'vitest'
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory'
import {
  closeUserDatabases,
  createValoraDatabase,
  lastWriteWins,
  openUserDatabase,
  type TransactionDoc,
  type ValoraDatabase,
} from './db'

const KEY = 'a'.repeat(64)
const opened: ValoraDatabase[] = []

function uniqueName() {
  return `test-${crypto.randomUUID()}`
}

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

/** Memory storage that records every document written to it. */
function recordingStorage() {
  const base = getRxStorageMemory()
  const written: Record<string, unknown>[] = []
  const storage: typeof base = {
    ...base,
    async createStorageInstance(params) {
      const instance = await base.createStorageInstance(params)
      const bulkWrite = instance.bulkWrite.bind(instance)
      instance.bulkWrite = (rows, context) => {
        written.push(...rows.map((row) => row.document))
        return bulkWrite(rows, context)
      }
      return instance
    },
  }
  return { storage, written }
}

describe('createValoraDatabase', () => {
  afterEach(async () => {
    await Promise.all(opened.splice(0).map((db) => db.close()))
    await closeUserDatabases()
  })

  it('stores and reads back transactions', async () => {
    const db = await createValoraDatabase({
      name: uniqueName(),
      encryptionKey: KEY,
      storage: getRxStorageMemory(),
    })
    opened.push(db)
    const doc = transaction()

    await db.transactions.insert(doc)

    const stored = await db.transactions.findOne(doc.id).exec()
    expect(stored?.toJSON()).toEqual(expect.objectContaining(doc))
  })

  it('encrypts the description and value at rest', async () => {
    const { storage, written } = recordingStorage()
    const db = await createValoraDatabase({
      name: uniqueName(),
      encryptionKey: KEY,
      storage,
    })
    opened.push(db)
    const doc = transaction()

    await db.transactions.insert(doc)

    const raw = written.find((row) => row.id === doc.id)
    expect(raw).toBeDefined()
    expect(raw?.accountId).toBe('acc-1')
    expect(raw?.description).not.toBe('Groceries')
    expect(raw?.value).not.toBe(4599)
    expect(JSON.stringify(raw)).not.toContain('Groceries')
  })

  it('refuses to open an existing database with a different key', async () => {
    const name = uniqueName()
    const storage = getRxStorageMemory()
    const db = await createValoraDatabase({ name, encryptionKey: KEY, storage })
    await db.close()

    await expect(
      createValoraDatabase({ name, encryptionKey: 'b'.repeat(64), storage }),
    ).rejects.toThrow()
  })
})

describe('openUserDatabase', () => {
  afterEach(async () => {
    await closeUserDatabases()
  })

  it('reuses the open database for the same user', async () => {
    const storage = getRxStorageMemory()
    const first = await openUserDatabase('user-1', KEY, storage)
    const second = await openUserDatabase('user-1', KEY, storage)

    expect(second).toBe(first)
  })

  it('closes every open database', async () => {
    const db = await openUserDatabase('user-1', KEY, getRxStorageMemory())

    await closeUserDatabases()

    expect(db.closed).toBe(true)
  })
})

describe('lastWriteWins', () => {
  const master = { ...transaction({ value: 1000, updatedAt: 2_000 }), _deleted: false }

  it('keeps the local change when it is newer than the server state', async () => {
    const local = { ...master, value: 2000, updatedAt: 3_000 }

    const resolved = await lastWriteWins.resolve(
      { newDocumentState: local, realMasterState: master },
      'test',
    )

    expect(resolved).toBe(local)
  })

  it('takes the server state when it is newer than the local change', async () => {
    const local = { ...master, value: 2000, updatedAt: 1_500 }

    const resolved = await lastWriteWins.resolve(
      { newDocumentState: local, realMasterState: master },
      'test',
    )

    expect(resolved).toBe(master)
  })

  it('treats documents with the same content as equal', () => {
    expect(lastWriteWins.isEqual(master, { ...master }, 'test')).toBe(true)
    expect(lastWriteWins.isEqual(master, { ...master, value: 1 }, 'test')).toBe(false)
  })
})
