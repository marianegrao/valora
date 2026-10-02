import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { resetDatabase } from './resetDatabase';

describe('Sync (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  async function registerUser(email: string) {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Test User', email, password: 'super-secret' })
      .expect(201);
    return response.body.accessToken as string;
  }

  async function createAccount(token: string) {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Wallet', currency: 'BRL' })
      .expect(201);
    return response.body.id as string;
  }

  async function createTransaction(
    token: string,
    accountId: string,
    value: number,
  ) {
    const response = await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ accountId, value, type: 'DEBIT', paymentMethod: 'PIX' })
      .expect(201);
    return response.body.id as string;
  }

  function pull(token: string, query: Record<string, string | number>) {
    return request(app.getHttpServer())
      .get('/sync/transactions/pull')
      .query(query)
      .set('Authorization', `Bearer ${token}`);
  }

  describe('GET /sync/transactions/pull', () => {
    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer())
        .get('/sync/transactions/pull')
        .query({ batchSize: 10 })
        .expect(401);
    });

    it("returns only the caller's transactions with a checkpoint", async () => {
      const tokenA = await registerUser('a@example.com');
      const tokenB = await registerUser('b@example.com');
      const accountA = await createAccount(tokenA);
      const accountB = await createAccount(tokenB);
      const txA = await createTransaction(tokenA, accountA, 1000);
      await createTransaction(tokenB, accountB, 2000);

      const response = await pull(tokenA, { batchSize: 10 }).expect(200);

      expect(response.body.documents).toEqual([
        expect.objectContaining({
          id: txA,
          accountId: accountA,
          value: 1000,
          updatedAt: expect.any(Number),
          _deleted: false,
        }),
      ]);
      expect(response.body.checkpoint).toEqual({
        id: txA,
        serverUpdatedAt: expect.any(Number),
      });
    });

    it('pages through transactions using the returned checkpoint', async () => {
      const token = await registerUser('owner@example.com');
      const accountId = await createAccount(token);
      await createTransaction(token, accountId, 1000);
      await createTransaction(token, accountId, 2000);
      await createTransaction(token, accountId, 3000);

      const first = await pull(token, { batchSize: 2 }).expect(200);
      expect(first.body.documents).toHaveLength(2);

      const second = await pull(token, {
        batchSize: 2,
        id: first.body.checkpoint.id,
        serverUpdatedAt: first.body.checkpoint.serverUpdatedAt,
      }).expect(200);
      expect(second.body.documents).toHaveLength(1);

      const values = [...first.body.documents, ...second.body.documents]
        .map((doc: { value: number }) => doc.value)
        .sort();
      expect(values).toEqual([1000, 2000, 3000]);
    });

    it('includes soft-deleted transactions flagged as deleted', async () => {
      const token = await registerUser('owner@example.com');
      const accountId = await createAccount(token);
      const txId = await createTransaction(token, accountId, 1000);
      await prisma.transaction.update({
        where: { id: txId },
        data: { deletedAt: new Date() },
      });

      const response = await pull(token, { batchSize: 10 }).expect(200);

      expect(response.body.documents).toEqual([
        expect.objectContaining({ id: txId, _deleted: true }),
      ]);
    });

    it('rejects an invalid batch size with 400', async () => {
      const token = await registerUser('owner@example.com');
      await pull(token, { batchSize: 0 }).expect(400);
    });
  });
});
