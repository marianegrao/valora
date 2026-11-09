import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AddressInfo } from 'net';
import { randomUUID } from 'crypto';
import {
  createRxDatabase,
  RxCollection,
  RxConflictHandler,
  RxDatabase,
  RxJsonSchema,
} from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { replicateRxCollection } from 'rxdb/plugins/replication';
import { deepEqual } from 'rxdb/plugins/utils';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { resetDatabase } from './resetDatabase';

/**
 * Proves last-write-wins-by-updatedAt across two offline "devices".
 *
 * Each device is an in-process RxDB database on memory storage. The
 * replication config below is deliberately re-implemented here instead of
 * imported from the frontend: a backend test must not depend on frontend
 * code. The app listens on a real port because RxDB's handlers make real
 * fetch() calls.
 */

interface TransactionDoc {
  id: string;
  accountId: string;
  description: string | null;
  value: number;
  type: 'DEBIT' | 'CREDIT';
  paymentMethod: 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'CASH';
  createdAt: number;
  updatedAt: number;
}

interface Checkpoint {
  id: string;
  serverUpdatedAt: number;
}

type TransactionCollection = RxCollection<TransactionDoc>;

const transactionSchema: RxJsonSchema<TransactionDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 36 },
    accountId: { type: 'string' },
    description: { type: ['string', 'null'] },
    value: { type: 'integer' },
    type: { type: 'string' },
    paymentMethod: { type: 'string' },
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
};

const lastWriteWins: RxConflictHandler<TransactionDoc> = {
  isEqual: (a, b) => deepEqual(a, b),
  resolve: async ({ newDocumentState, realMasterState }) =>
    newDocumentState.updatedAt > realMasterState.updatedAt
      ? newDocumentState
      : realMasterState,
};

describe('Sync conflict resolution (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let token: string;
  let accountId: string;
  const openDatabases: RxDatabase[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;

    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);

    const registered = await api('/auth/register', {
      name: 'Test User',
      email: 'owner@example.com',
      password: 'super-secret',
    });
    token = registered.accessToken;
    const account = await api('/accounts', { name: 'Wallet', currency: 'BRL' });
    accountId = account.id;
  });

  afterEach(async () => {
    await Promise.all(openDatabases.splice(0).map((db) => db.close()));
  });

  async function api(path: string, body: unknown) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`${path} failed with ${response.status}`);
    }
    return response.json();
  }

  async function createDevice(): Promise<TransactionCollection> {
    const db = await createRxDatabase({
      name: `device-${randomUUID()}`,
      storage: getRxStorageMemory(),
    });
    openDatabases.push(db);
    const { transactions } = await db.addCollections({
      transactions: {
        schema: transactionSchema,
        conflictHandler: lastWriteWins,
      },
    });
    return transactions;
  }

  /** One-shot replication, as the app runs it on start / reconnect. */
  async function sync(collection: TransactionCollection) {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    const replication = replicateRxCollection<TransactionDoc, Checkpoint>({
      collection,
      replicationIdentifier: 'valora-transactions',
      live: false,
      pull: {
        batchSize: 10,
        async handler(checkpoint, batchSize) {
          const params = new URLSearchParams({ batchSize: String(batchSize) });
          if (checkpoint) {
            params.set('id', checkpoint.id);
            params.set('serverUpdatedAt', String(checkpoint.serverUpdatedAt));
          }
          const response = await fetch(
            `${baseUrl}/sync/transactions/pull?${params}`,
            { headers },
          );
          if (!response.ok) throw new Error(`pull ${response.status}`);
          const body = await response.json();
          return {
            documents: body.documents,
            checkpoint: body.checkpoint ?? undefined,
          };
        },
      },
      push: {
        async handler(rows) {
          const response = await fetch(`${baseUrl}/sync/transactions/push`, {
            method: 'POST',
            headers,
            body: JSON.stringify(rows),
          });
          if (!response.ok) throw new Error(`push ${response.status}`);
          return response.json();
        },
      },
    });
    const errors: unknown[] = [];
    replication.error$.subscribe((error) => errors.push(error));
    await replication.awaitInitialReplication();
    await replication.cancel();
    expect(errors).toEqual([]);
  }

  /** Device A creates a transaction and both devices sync it down. */
  async function setUpSharedTransaction() {
    const deviceA = await createDevice();
    const deviceB = await createDevice();
    const id = randomUUID();
    await deviceA.insert({
      id,
      accountId,
      description: 'Groceries',
      value: 1000,
      type: 'DEBIT',
      paymentMethod: 'PIX',
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    await sync(deviceA);
    await sync(deviceB);
    expect((await deviceB.findOne(id).exec())?.value).toBe(1000);
    return { deviceA, deviceB, id };
  }

  async function serverRow(id: string) {
    return prisma.transaction.findUniqueOrThrow({ where: { id } });
  }

  it('keeps the newer offline edit when it reaches the server first', async () => {
    const { deviceA, deviceB, id } = await setUpSharedTransaction();

    // Both devices edit while offline; B's edit is the more recent one.
    await (await deviceA.findOne(id).exec())!.incrementalPatch({
      value: 1111,
      updatedAt: 2_000,
    });
    await (await deviceB.findOne(id).exec())!.incrementalPatch({
      value: 2222,
      updatedAt: 3_000,
    });

    await sync(deviceB);
    await sync(deviceA);
    await sync(deviceB);

    expect((await deviceA.findOne(id).exec())?.value).toBe(2222);
    expect((await deviceB.findOne(id).exec())?.value).toBe(2222);
    expect(await serverRow(id)).toEqual(
      expect.objectContaining({ value: 2222, updatedAt: new Date(3_000) }),
    );
  });

  it('keeps the newer offline edit when the older one reaches the server first', async () => {
    const { deviceA, deviceB, id } = await setUpSharedTransaction();

    await (await deviceA.findOne(id).exec())!.incrementalPatch({
      value: 1111,
      updatedAt: 2_000,
    });
    await (await deviceB.findOne(id).exec())!.incrementalPatch({
      value: 2222,
      updatedAt: 3_000,
    });

    await sync(deviceA);
    await sync(deviceB);
    await sync(deviceA);

    expect((await deviceA.findOne(id).exec())?.value).toBe(2222);
    expect((await deviceB.findOne(id).exec())?.value).toBe(2222);
    expect(await serverRow(id)).toEqual(
      expect.objectContaining({ value: 2222, updatedAt: new Date(3_000) }),
    );
  });

  it('propagates a newer offline soft-delete over an older offline edit', async () => {
    const { deviceA, deviceB, id } = await setUpSharedTransaction();

    await (await deviceA.findOne(id).exec())!.incrementalPatch({
      value: 1111,
      updatedAt: 2_000,
    });
    const docB = await deviceB.findOne(id).exec();
    await docB!.incrementalPatch({ updatedAt: 3_000 });
    await (await deviceB.findOne(id).exec())!.incrementalRemove();

    await sync(deviceA);
    await sync(deviceB);
    await sync(deviceA);

    expect(await deviceA.findOne(id).exec()).toBeNull();
    expect(await deviceB.findOne(id).exec()).toBeNull();
    expect((await serverRow(id)).deletedAt).toEqual(new Date(3_000));
  });
});
