import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class PullQueryDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  serverUpdatedAt?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  batchSize: number;
}
