import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: {
    account: { findUnique: jest.Mock };
    transaction: { findMany: jest.Mock; create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      account: { findUnique: jest.fn() },
      transaction: { findMany: jest.fn(), create: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
  });

  describe('findAllForAccount', () => {
    it('lists transactions for an account owned by the user', async () => {
      prisma.account.findUnique.mockResolvedValue({
        id: 'acc-1',
        userId: 'user-1',
      });
      const transactions = [{ id: 'tx-1', accountId: 'acc-1' }];
      prisma.transaction.findMany.mockResolvedValue(transactions);

      const result = await service.findAllForAccount('user-1', 'acc-1');

      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: { accountId: 'acc-1' },
      });
      expect(result).toEqual(transactions);
    });

    it('throws not found when the account does not belong to the user', async () => {
      prisma.account.findUnique.mockResolvedValue({
        id: 'acc-1',
        userId: 'someone-else',
      });

      await expect(
        service.findAllForAccount('user-1', 'acc-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    });

    it('throws not found when the account does not exist', async () => {
      prisma.account.findUnique.mockResolvedValue(null);

      await expect(
        service.findAllForAccount('user-1', 'missing-acc'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates a transaction on an account owned by the user', async () => {
      prisma.account.findUnique.mockResolvedValue({
        id: 'acc-1',
        userId: 'user-1',
      });
      prisma.transaction.create.mockResolvedValue({
        id: 'tx-1',
        userId: 'user-1',
        accountId: 'acc-1',
        value: 1000,
        type: 'DEBIT',
        paymentMethod: 'PIX',
      });

      const result = await service.create('user-1', {
        accountId: 'acc-1',
        value: 1000,
        type: 'DEBIT',
        paymentMethod: 'PIX',
      });

      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          accountId: 'acc-1',
          description: undefined,
          value: 1000,
          type: 'DEBIT',
          paymentMethod: 'PIX',
        },
      });
      expect(result.id).toBe('tx-1');
    });

    it('throws not found when the account does not belong to the user', async () => {
      prisma.account.findUnique.mockResolvedValue({
        id: 'acc-1',
        userId: 'someone-else',
      });

      await expect(
        service.create('user-1', {
          accountId: 'acc-1',
          value: 1000,
          type: 'DEBIT',
          paymentMethod: 'PIX',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });
  });
});
