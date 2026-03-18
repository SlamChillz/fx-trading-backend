import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { CurrentUserPayload } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('transactions')
@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  private readonly logger = new Logger(TransactionsController.name);

  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Req() req: Request & { traceId?: string },
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    this.logger.log(
      `[${req.traceId || 'no-trace'}] list transactions userId=${user.userId} type=${type || '-'} status=${status || '-'} page=${page || 1} limit=${limit || 20}`,
    );
    const [items, total] = await this.transactionsService.listForUser(
      user.userId,
      { type: type as any, status: status as any },
      { page, limit },
    );
    this.logger.log(
      `[${req.traceId || 'no-trace'}] list transactions result userId=${user.userId} total=${total} returned=${items.length}`,
    );
    return { total, items, page: page || 1, limit: limit || 20 };
  }

  @Get('analytics')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiQuery({
    name: 'includeDaily',
    required: false,
    description:
      'If true and both from & to are set, includes per-day breakdown (max range 366 days).',
  })
  async analytics(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('includeDaily') includeDaily?: string,
  ) {
    const fromDate = parseOptionalDate(from, 'from');
    const toDate = parseOptionalDate(to, 'to');
    if (fromDate && toDate && toDate < fromDate) {
      throw new BadRequestException('Query "to" must be on or after "from"');
    }
    const daily =
      includeDaily === 'true' || includeDaily === '1' || includeDaily === 'yes';
    const data = await this.transactionsService.analytics(fromDate, toDate, daily);
    return data;
  }
}

function parseOptionalDate(value: string | undefined, name: string): Date | undefined {
  if (value == null || value === '') {
    return undefined;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`Invalid date for query "${name}"`);
  }
  return d;
}

