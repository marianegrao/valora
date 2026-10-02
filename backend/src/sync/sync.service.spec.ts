import { Test, TestingModule } from '@nestjs/testing';
import { SyncService } from './sync.service';
import { PrismaService } from '../prisma/prisma.service';

function transactionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-1',
    userId: 'user-1',
    accountId: 'acc-1',
    description: 'Groceries',
    value: 4599,
    type: 'DEBIT',
    paymentMethod: 'PIX',
    createdAt: new Date(1_000),
    updatedAt: new Date(2_000),
    serverUpdatedAt: new Date(3_000),
    deletedAt: null,
    ...overrides,
  };
}

describe('SyncService', () => {
  let service: SyncService;
  let prisma: {
    transaction: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      transaction: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SyncService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<SyncService>(SyncService);
  });

  describe('pullTransactions', () => {
    it("queries the user's transactions from the start when there is no checkpoint", async () => {
      prisma.transaction.findMany.mockResolvedValue([]);

      await service.pullTransactions('user-1', undefined, 50);

      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: [{ serverUpdatedAt: 'asc' }, { id: 'asc' }],
        take: 50,
      });
    });

    it('only queries transactions written after the checkpoint', async () => {
      prisma.transaction.findMany.mockResolvedValue([]);

      await service.pullTransactions(
        'user-1',
        { id: 'tx-1', serverUpdatedAt: 3_000 },
        50,
      );

      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          OR: [
            { serverUpdatedAt: { gt: new Date(3_000) } },
            { serverUpdatedAt: new Date(3_000), id: { gt: 'tx-1' } },
          ],
        },
        orderBy: [{ serverUpdatedAt: 'asc' }, { id: 'asc' }],
        take: 50,
      });
    });

    it('maps rows to sync documents and returns the last row as the new checkpoint', async () => {
      prisma.transaction.findMany.mockResolvedValue([
        transactionRow(),
        transactionRow({
          id: 'tx-2',
          serverUpdatedAt: new Date(4_000),
          deletedAt: new Date(4_000),
        }),
      ]);

      const result = await service.pullTransactions('user-1', undefined, 50);

      expect(result.documents).toEqual([
        {
          id: 'tx-1',
          accountId: 'acc-1',
          description: 'Groceries',
          value: 4599,
          type: 'DEBIT',
          paymentMethod: 'PIX',
          createdAt: 1_000,
          updatedAt: 2_000,
          _deleted: false,
        },
        expect.objectContaining({ id: 'tx-2', _deleted: true }),
      ]);
      expect(result.checkpoint).toEqual({ id: 'tx-2', serverUpdatedAt: 4_000 });
    });

    it('keeps the given checkpoint when there is nothing new', async () => {
      prisma.transaction.findMany.mockResolvedValue([]);
      const checkpoint = { id: 'tx-1', serverUpdatedAt: 3_000 };

      const result = await service.pullTransactions('user-1', checkpoint, 50);

      expect(result).toEqual({ documents: [], checkpoint });
    });
  });
});
