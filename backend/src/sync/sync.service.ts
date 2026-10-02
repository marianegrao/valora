import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  SyncCheckpoint,
  SyncTransactionDocument,
  toSyncDocument,
} from './sync-transaction';

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
}
