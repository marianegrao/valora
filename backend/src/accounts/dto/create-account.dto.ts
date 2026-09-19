import { IsIn, IsString, MinLength } from 'class-validator';
import { Currency } from '@prisma/client';

export class CreateAccountDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsIn(Object.values(Currency))
  currency: Currency;
}
