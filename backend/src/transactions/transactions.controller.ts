import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListTransactionsQueryDto,
  ) {
    return this.transactionsService.findAllForAccount(
      user.id,
      query.accountId,
    );
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTransactionDto,
  ) {
    return this.transactionsService.create(user.id, dto);
  }
}
