import { Injectable } from '@nestjs/common';
import { Account } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  findAllForUser(userId: string): Promise<Account[]> {
    return this.prisma.account.findMany({ where: { userId } });
  }

  create(userId: string, dto: CreateAccountDto): Promise<Account> {
    return this.prisma.account.create({
      data: { userId, name: dto.name, currency: dto.currency },
    });
  }
}
