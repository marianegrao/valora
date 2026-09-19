import { Test, TestingModule } from '@nestjs/testing';
import { AccountsService } from './accounts.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AccountsService', () => {
  let service: AccountsService;
  let prisma: {
    account: { findMany: jest.Mock; create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      account: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AccountsService>(AccountsService);
  });

  describe('findAllForUser', () => {
    it('lists only accounts belonging to the given user', async () => {
      const accounts = [{ id: 'acc-1', userId: 'user-1', name: 'Wallet' }];
      prisma.account.findMany.mockResolvedValue(accounts);

      const result = await service.findAllForUser('user-1');

      expect(prisma.account.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(result).toEqual(accounts);
    });
  });

  describe('create', () => {
    it('creates an account scoped to the given user', async () => {
      prisma.account.create.mockResolvedValue({
        id: 'acc-1',
        userId: 'user-1',
        name: 'Wallet',
        currency: 'BRL',
      });

      const result = await service.create('user-1', {
        name: 'Wallet',
        currency: 'BRL',
      });

      expect(prisma.account.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', name: 'Wallet', currency: 'BRL' },
      });
      expect(result).toEqual({
        id: 'acc-1',
        userId: 'user-1',
        name: 'Wallet',
        currency: 'BRL',
      });
    });
  });
});
