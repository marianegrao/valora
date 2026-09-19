import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock };
  };
  let jwtService: { sign: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };
    jwtService = {
      sign: jest.fn().mockReturnValue('signed-jwt-token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('creates a user with a hashed password and returns an access token', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'user-1',
          name: data.name,
          email: data.email,
          password: data.password,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const result = await service.register({
        name: 'Maria',
        email: 'maria@example.com',
        password: 'super-secret',
      });

      expect(prisma.user.create).toHaveBeenCalled();
      const createdPassword = prisma.user.create.mock.calls[0][0].data
        .password as string;
      expect(createdPassword).not.toBe('super-secret');
      expect(await bcrypt.compare('super-secret', createdPassword)).toBe(
        true,
      );

      expect(result).toEqual({
        accessToken: 'signed-jwt-token',
        user: { id: 'user-1', name: 'Maria', email: 'maria@example.com' },
      });
    });

    it('throws a conflict error when the email is already registered', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(
        service.register({
          name: 'Maria',
          email: 'maria@example.com',
          password: 'super-secret',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns an access token when the credentials are valid', async () => {
      const hashed = await bcrypt.hash('super-secret', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'Maria',
        email: 'maria@example.com',
        password: hashed,
      });

      const result = await service.login({
        email: 'maria@example.com',
        password: 'super-secret',
      });

      expect(result).toEqual({
        accessToken: 'signed-jwt-token',
        user: { id: 'user-1', name: 'Maria', email: 'maria@example.com' },
      });
    });

    it('throws unauthorized when the email is unknown', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'whatever' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws unauthorized when the password is wrong', async () => {
      const hashed = await bcrypt.hash('correct-password', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'Maria',
        email: 'maria@example.com',
        password: hashed,
      });

      await expect(
        service.login({
          email: 'maria@example.com',
          password: 'wrong-password',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
