import { IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PaymentMethod, TransactionType } from '@prisma/client';

export class CreateTransactionDto {
  @IsUUID()
  accountId: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(1)
  value: number;

  @IsIn(Object.values(TransactionType))
  type: TransactionType;

  @IsIn(Object.values(PaymentMethod))
  paymentMethod: PaymentMethod;
}
