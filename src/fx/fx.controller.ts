import { Controller, Get, Query } from '@nestjs/common';
import { FxService } from './fx.service';
import { RateLimit } from '../common/rate-limit.decorator';
import { ApiQuery, ApiTags } from '@nestjs/swagger';

@ApiTags('fx')
@Controller('fx')
export class FxController {
  constructor(private readonly fxService: FxService) {}

  @Get('rates')
  @RateLimit({ limit: 60, windowSec: 60 })
  @ApiQuery({
    name: 'base',
    required: false,
    example: 'NGN',
    description: 'Base currency for FX rates (defaults to NGN)',
  })
  getRates(@Query('base') base?: string) {
    return this.fxService.getRates(base || 'NGN');
  }
}

