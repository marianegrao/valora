import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  SyncCheckpoint,
  SyncTransactionDocument,
  toSyncDocument,
} from './sync-transaction';

/** Pushed documents may omit an empty description. */
type PushedDocument = Omit<SyncTransactionDocument, 'description'> & {
  description?: string | null;
};

export interface PushRow {
  assumedMasterState?: PushedDocument;
  newDocumentState: PushedDocument;
}

function isSameState(a: PushedDocument, b: PushedDocument): boolean {
  return (
    a.id === b.id &&
    a.accountId === b.accountId &&
    (a.description ?? null) === (b.description ?? null) &&
    a.value === b.value &&
    a.type === b.type &&
    a.paymentMethod === b.paymentMethod &&
    a.createdAt === b.createdAt &&
    a.updatedAt === b.updatedAt &&
    a._deleted === b._deleted
  );
}

export interface PullResult {
  documents: SyncTransactionDocument[];
  checkpoint: SyncCheckpoint | null;
}

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  async pullTransactions(
    userId: string,
    checkpoint: SyncCheckpoint | undefined,
    batchSize: number,
  ): Promise<PullResult> {
    const after = checkpoint
      ? {
          OR: [
            { serverUpdatedAt: { gt: new Date(checkpoint.serverUpdatedAt) } },
            {
              serverUpdatedAt: new Date(checkpoint.serverUpdatedAt),
              id: { gt: checkpoint.id },
            },
          ],
        }
      : {};

    const rows = await this.prisma.transaction.findMany({
      where: { userId, ...after },
      orderBy: [{ serverUpdatedAt: 'asc' }, { id: 'asc' }],
      take: batchSize,
    });

    const last = rows.at(-1);
    return {
      documents: rows.map(toSyncDocument),
      checkpoint: last
        ? { id: last.id, serverUpdatedAt: last.serverUpdatedAt.getTime() }
        : (checkpoint ?? null),
    };
  }

  /**
   * Applies pushed changes and returns the real master state of every row
   * whose assumed master state was stale. Resolving those conflicts
   * (last-write-wins by updatedAt) is the client's conflictHandler's job.
   *
   * Ownership is checked for the whole batch before anything is written:
   * a row targeting someone else's account or transaction rejects the
   * entire push with 404, so existence is not leaked and nothing is
   * partially applied.
   */
  async pushTransactions(
    userId: string,
    rows: PushRow[],
  ): Promise<SyncTransactionDocument[]> {
    return this.prisma.$transaction(async (tx) => {
      const accountIds = [
        ...new Set(rows.map((row) => row.newDocumentState.accountId)),
      ];
      const ownedAccounts = await tx.account.findMany({
        where: { id: { in: accountIds }, userId },
        select: { id: true },
      });
      if (ownedAccounts.length !== accountIds.length) {
        throw new NotFoundException('Account not found');
      }

      const existing = await tx.transaction.findMany({
        where: { id: { in: rows.map((row) => row.newDocumentState.id) } },
      });
      if (existing.some((master) => master.userId !== userId)) {
        throw new NotFoundException('Transaction not found');
      }
      const masters = new Map(
        existing.map((master) => [master.id, toSyncDocument(master)]),
      );

      const conflicts: SyncTransactionDocument[] = [];
      for (const { assumedMasterState, newDocumentState } of rows) {
        const master = masters.get(newDocumentState.id);
        if (
          master &&
          (!assumedMasterState || !isSameState(master, assumedMasterState))
        ) {
          conflicts.push(master);
          continue;
        }

        const data = {
          accountId: newDocumentState.accountId,
          description: newDocumentState.description ?? null,
          value: newDocumentState.value,
          type: newDocumentState.type,
          paymentMethod: newDocumentState.paymentMethod,
          createdAt: new Date(newDocumentState.createdAt),
          updatedAt: new Date(newDocumentState.updatedAt),
          deletedAt: newDocumentState._deleted
            ? new Date(newDocumentState.updatedAt)
            : null,
        };
        await tx.transaction.upsert({
          where: { id: newDocumentState.id },
          create: { id: newDocumentState.id, userId, ...data },
          update: data,
        });
      }
      return conflicts;
    });
  }
}
