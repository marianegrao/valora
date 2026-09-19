import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Accounts (e2e)', () => {
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
    await prisma.account.deleteMany();
    await prisma.user.deleteMany();
  });

  async function registerUser(email: string) {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Test User', email, password: 'super-secret' })
      .expect(201);
    return response.body.accessToken as string;
  }

  it('rejects unauthenticated requests with 401', async () => {
    await request(app.getHttpServer()).get('/accounts').expect(401);
    await request(app.getHttpServer())
      .post('/accounts')
      .send({ name: 'Wallet', currency: 'BRL' })
      .expect(401);
  });

  it('creates an account for the authenticated user', async () => {
    const token = await registerUser('owner@example.com');

    const response = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Wallet', currency: 'BRL' })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({ name: 'Wallet', currency: 'BRL' }),
    );
  });

  it('only lists accounts owned by the current user', async () => {
    const tokenA = await registerUser('a@example.com');
    const tokenB = await registerUser('b@example.com');

    await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'A Wallet', currency: 'BRL' })
      .expect(201);

    const responseB = await request(app.getHttpServer())
      .get('/accounts')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(responseB.body).toEqual([]);

    const responseA = await request(app.getHttpServer())
      .get('/accounts')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(responseA.body).toHaveLength(1);
    expect(responseA.body[0]).toEqual(
      expect.objectContaining({ name: 'A Wallet' }),
    );
  });
});
