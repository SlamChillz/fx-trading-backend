import { Body, Controller, Get, Headers, Post, UseGuards } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CurrentUserPayload } from '../common/current-user.decorator';
import { FundWalletDto } from './dto/fund-wallet.dto';
import { ConvertDto } from './dto/convert.dto';
import { RateLimit } from '../common/rate-limit.decorator';
import { ApiBody, ApiTags } from '@nestjs/swagger';

@ApiTags('wallet')
@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @RateLimit({ limit: 30, windowSec: 60 })
  async getWallet(@CurrentUser() user: CurrentUserPayload) {
    const balances = await this.walletService.getBalances(user.userId);
    return { balances };
  }

  @Post('fund')
  @RateLimit({ limit: 10, windowSec: 60 })
  @ApiBody({
    type: FundWalletDto,
    examples: {
      default: {
        summary: 'Fund wallet in NGN',
        value: {
          amount: 10000,
          currency: 'NGN',
        },
      },
    },
  })
  async fund(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: FundWalletDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const tx = await this.walletService.fund(user.userId, dto.amount, dto.currency, idempotencyKey);
    const balances = await this.walletService.getBalances(user.userId);
    return { transaction: tx, balances };
  }

  @Post('convert')
  @RateLimit({ limit: 20, windowSec: 60 })
  @ApiBody({
    type: ConvertDto,
    examples: {
      default: {
        summary: 'Convert NGN to USD',
        value: {
          fromCurrency: 'NGN',
          toCurrency: 'USD',
          amount: 1000,
        },
      },
    },
  })
  async convert(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ConvertDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const tx = await this.walletService.convert(
      user.userId,
      dto.fromCurrency,
      dto.toCurrency,
      dto.amount,
      idempotencyKey,
      false,
    );
    const balances = await this.walletService.getBalances(user.userId);
    return { transaction: tx, balances };
  }

  @Post('trade')
  @RateLimit({ limit: 20, windowSec: 60 })
  @ApiBody({
    type: ConvertDto,
    examples: {
      default: {
        summary: 'Trade NGN to EUR',
        value: {
          fromCurrency: 'NGN',
          toCurrency: 'EUR',
          amount: 5000,
        },
      },
    },
  })
  async trade(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ConvertDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const tx = await this.walletService.convert(
      user.userId,
      dto.fromCurrency,
      dto.toCurrency,
      dto.amount,
      idempotencyKey,
      true,
    );
    const balances = await this.walletService.getBalances(user.userId);
    return { transaction: tx, balances };
  }
}

