import { Injectable, NotFoundException } from '@nestjs/common';
import { Transaction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertAccountOwnership(userId: string, accountId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });
    if (!account || account.userId !== userId) {
      throw new NotFoundException('Account not found');
    }
  }

  async findAllForAccount(
    userId: string,
    accountId: string,
  ): Promise<Transaction[]> {
    await this.assertAccountOwnership(userId, accountId);
    return this.prisma.transaction.findMany({ where: { accountId } });
  }

  async create(
    userId: string,
    dto: CreateTransactionDto,
  ): Promise<Transaction> {
    await this.assertAccountOwnership(userId, dto.accountId);
    return this.prisma.transaction.create({
      data: {
        userId,
        accountId: dto.accountId,
        description: dto.description,
        value: dto.value,
        type: dto.type,
        paymentMethod: dto.paymentMethod,
      },
    });
  }
}
