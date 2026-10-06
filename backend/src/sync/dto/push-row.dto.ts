import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod, TransactionType } from '@prisma/client';

export class SyncTransactionDocumentDto {
  @IsUUID()
  id: string;

  @IsUUID()
  accountId: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsInt()
  @Min(1)
  value: number;

  @IsIn(Object.values(TransactionType))
  type: TransactionType;

  @IsIn(Object.values(PaymentMethod))
  paymentMethod: PaymentMethod;

  @IsInt()
  @Min(0)
  createdAt: number;

  @IsInt()
  @Min(0)
  updatedAt: number;

  @IsBoolean()
  _deleted: boolean;
}

export class PushRowDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => SyncTransactionDocumentDto)
  assumedMasterState?: SyncTransactionDocumentDto;

  @ValidateNested()
  @Type(() => SyncTransactionDocumentDto)
  newDocumentState: SyncTransactionDocumentDto;
}
