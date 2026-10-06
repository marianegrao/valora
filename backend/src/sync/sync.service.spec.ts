import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
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
    $transaction: jest.Mock;
    account: { findMany: jest.Mock };
    transaction: { findMany: jest.Mock; upsert: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
      account: { findMany: jest.fn() },
      transaction: { findMany: jest.fn(), upsert: jest.fn() },
    };
    prisma.$transaction.mockImplementation((work) => work(prisma));

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

  describe('pushTransactions', () => {
    const newDocument = {
      id: 'tx-1',
      accountId: 'acc-1',
      description: 'Groceries',
      value: 4599,
      type: 'DEBIT' as const,
      paymentMethod: 'PIX' as const,
      createdAt: 1_000,
      updatedAt: 2_000,
      _deleted: false,
    };

    beforeEach(() => {
      prisma.account.findMany.mockResolvedValue([{ id: 'acc-1' }]);
      prisma.transaction.findMany.mockResolvedValue([]);
    });

    it('creates a transaction that does not exist yet, owned by the caller', async () => {
      const conflicts = await service.pushTransactions('user-1', [
        { newDocumentState: newDocument },
      ]);

      expect(conflicts).toEqual([]);
      expect(prisma.account.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['acc-1'] }, userId: 'user-1' },
        select: { id: true },
      });
      const data = {
        accountId: 'acc-1',
        description: 'Groceries',
        value: 4599,
        type: 'DEBIT',
        paymentMethod: 'PIX',
        createdAt: new Date(1_000),
        updatedAt: new Date(2_000),
        deletedAt: null,
      };
      expect(prisma.transaction.upsert).toHaveBeenCalledWith({
        where: { id: 'tx-1' },
        create: { id: 'tx-1', userId: 'user-1', ...data },
        update: data,
      });
    });

    it('updates the master when the assumed master state matches it', async () => {
      prisma.transaction.findMany.mockResolvedValue([transactionRow()]);
      const assumed = { ...newDocument };

      const conflicts = await service.pushTransactions('user-1', [
        {
          assumedMasterState: assumed,
          newDocumentState: { ...newDocument, value: 5000, updatedAt: 5_000 },
        },
      ]);

      expect(conflicts).toEqual([]);
      expect(prisma.transaction.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            value: 5000,
            updatedAt: new Date(5_000),
          }),
        }),
      );
    });

    it('returns the real master state as a conflict when the assumed state is stale', async () => {
      prisma.transaction.findMany.mockResolvedValue([
        transactionRow({ value: 7000, updatedAt: new Date(4_000) }),
      ]);

      const conflicts = await service.pushTransactions('user-1', [
        {
          assumedMasterState: newDocument,
          newDocumentState: { ...newDocument, value: 5000, updatedAt: 5_000 },
        },
      ]);

      expect(conflicts).toEqual([
        expect.objectContaining({ id: 'tx-1', value: 7000, updatedAt: 4_000 }),
      ]);
      expect(prisma.transaction.upsert).not.toHaveBeenCalled();
    });

    it('returns a conflict when the client assumes no master but one exists', async () => {
      prisma.transaction.findMany.mockResolvedValue([transactionRow()]);

      const conflicts = await service.pushTransactions('user-1', [
        { newDocumentState: { ...newDocument, value: 5000 } },
      ]);

      expect(conflicts).toEqual([expect.objectContaining({ id: 'tx-1' })]);
      expect(prisma.transaction.upsert).not.toHaveBeenCalled();
    });

    it('soft-deletes by storing the deletion time in deletedAt', async () => {
      prisma.transaction.findMany.mockResolvedValue([transactionRow()]);

      await service.pushTransactions('user-1', [
        {
          assumedMasterState: newDocument,
          newDocumentState: {
            ...newDocument,
            updatedAt: 6_000,
            _deleted: true,
          },
        },
      ]);

      expect(prisma.transaction.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ deletedAt: new Date(6_000) }),
        }),
      );
    });

    it('rejects the whole push when an account does not belong to the caller', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      await expect(
        service.pushTransactions('user-1', [{ newDocumentState: newDocument }]),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.transaction.upsert).not.toHaveBeenCalled();
    });

    it('rejects the whole push when a transaction id belongs to another user', async () => {
      prisma.transaction.findMany.mockResolvedValue([
        transactionRow({ userId: 'someone-else' }),
      ]);

      await expect(
        service.pushTransactions('user-1', [{ newDocumentState: newDocument }]),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.transaction.upsert).not.toHaveBeenCalled();
    });
  });
});
