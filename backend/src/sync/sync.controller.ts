import { Controller, Get, Query } from '@nestjs/common';
import { SyncService } from './sync.service';
import { PullQueryDto } from './dto/pull-query.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.service';

@Controller('sync/transactions')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get('pull')
  pull(@CurrentUser() user: AuthenticatedUser, @Query() query: PullQueryDto) {
    const checkpoint =
      query.id !== undefined && query.serverUpdatedAt !== undefined
        ? { id: query.id, serverUpdatedAt: query.serverUpdatedAt }
        : undefined;
    return this.syncService.pullTransactions(
      user.id,
      checkpoint,
      query.batchSize,
    );
  }
}
