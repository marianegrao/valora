import { PrismaService } from './../src/prisma/prisma.service';

/**
 * Deletes rows in child→parent order (Transaction, Account, User).
 * FKs are RESTRICT, not CASCADE, so this order is required — deleting
 * a parent while children still reference it throws a constraint error.
 */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.transaction.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
}
