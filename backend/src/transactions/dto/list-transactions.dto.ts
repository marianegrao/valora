import { IsUUID } from 'class-validator';

export class ListTransactionsQueryDto {
  @IsUUID()
  accountId: string;
}
