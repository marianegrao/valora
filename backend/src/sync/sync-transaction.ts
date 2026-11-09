import { PaymentMethod, Transaction, TransactionType } from '@prisma/client';

/**
 * Wire shape of a Transaction in the RxDB replication protocol.
 * Timestamps are epoch milliseconds; soft-delete travels as `_deleted`.
 */
export interface SyncTransactionDocument {
  id: string;
  accountId: string;
  description: string | null;
  value: number;
  type: TransactionType;
  paymentMethod: PaymentMethod;
  createdAt: number;
  updatedAt: number;
  _deleted: boolean;
}

export interface SyncCheckpoint {
  id: string;
  serverUpdatedAt: number;
}

export function toSyncDocument(row: Transaction): SyncTransactionDocument {
  return {
    id: row.id,
    accountId: row.accountId,
    description: row.description,
    value: row.value,
    type: row.type,
    paymentMethod: row.paymentMethod,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    _deleted: row.deletedAt !== null,
  };
}
