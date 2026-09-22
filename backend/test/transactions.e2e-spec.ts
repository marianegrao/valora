import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { resetDatabase } from './resetDatabase';

describe('Transactions (e2e)', () => {
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

  async function createAccount(token: string, name = 'Wallet') {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, currency: 'BRL' })
      .expect(201);
    return response.body.id as string;
  }

  it('rejects unauthenticated requests with 401', async () => {
    await request(app.getHttpServer()).get('/transactions').expect(401);
    await request(app.getHttpServer())
      .post('/transactions')
      .send({ accountId: 'whatever', value: 1000, type: 'DEBIT', paymentMethod: 'PIX' })
      .expect(401);
  });

  it('creates a transaction on an owned account', async () => {
    const token = await registerUser('owner@example.com');
    const accountId = await createAccount(token);

    const response = await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        description: 'Groceries',
        value: 4599,
        type: 'DEBIT',
        paymentMethod: 'CREDIT_CARD',
      })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        accountId,
        description: 'Groceries',
        value: 4599,
        type: 'DEBIT',
        paymentMethod: 'CREDIT_CARD',
      }),
    );
  });

  it('rejects creating a transaction on an account owned by another user', async () => {
    const tokenA = await registerUser('a@example.com');
    const tokenB = await registerUser('b@example.com');
    const accountIdA = await createAccount(tokenA);

    await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        accountId: accountIdA,
        value: 1000,
        type: 'DEBIT',
        paymentMethod: 'PIX',
      })
      .expect(404);
  });

  it('lists only transactions for the requested account', async () => {
    const token = await registerUser('owner@example.com');
    const accountId = await createAccount(token, 'Wallet');
    const otherAccountId = await createAccount(token, 'Savings');

    await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ accountId, value: 1000, type: 'CREDIT', paymentMethod: 'PIX' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId: otherAccountId,
        value: 2000,
        type: 'DEBIT',
        paymentMethod: 'CASH',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/transactions?accountId=${accountId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toEqual(
      expect.objectContaining({ accountId, value: 1000 }),
    );
  });

  it("rejects listing another user's account transactions with 404", async () => {
    const tokenA = await registerUser('a@example.com');
    const tokenB = await registerUser('b@example.com');
    const accountIdA = await createAccount(tokenA);

    await request(app.getHttpServer())
      .get(`/transactions?accountId=${accountIdA}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });
});
