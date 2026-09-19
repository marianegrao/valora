import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  describe('POST /auth/register', () => {
    it('creates a user and returns an access token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Maria', email: 'maria@example.com', password: 'super-secret' })
        .expect(201);

      expect(response.body.accessToken).toEqual(expect.any(String));
      expect(response.body.user).toEqual({
        id: expect.any(String),
        name: 'Maria',
        email: 'maria@example.com',
      });
    });

    it('rejects a duplicate email with 409', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Maria', email: 'maria@example.com', password: 'super-secret' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Other', email: 'maria@example.com', password: 'another-secret' })
        .expect(409);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Maria', email: 'maria@example.com', password: 'super-secret' })
        .expect(201);
    });

    it('returns an access token for valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'maria@example.com', password: 'super-secret' })
        .expect(201);

      expect(response.body.accessToken).toEqual(expect.any(String));
    });

    it('rejects a wrong password with 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'maria@example.com', password: 'wrong-password' })
        .expect(401);
    });
  });

  describe('GET /auth/me', () => {
    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('returns the current user for a valid token', async () => {
      const registerResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Maria', email: 'maria@example.com', password: 'super-secret' })
        .expect(201);

      const token = registerResponse.body.accessToken;

      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toEqual({
        id: registerResponse.body.user.id,
        name: 'Maria',
        email: 'maria@example.com',
      });
    });
  });
});
