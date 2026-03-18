import { IsEnum, IsNumber, IsPositive } from 'class-validator';
import { CurrencyCode } from '../wallet-balance.entity';
import { ApiProperty } from '@nestjs/swagger';

export class FundWalletDto {
  @ApiProperty({ example: 10000 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ example: 'NGN', enum: ['NGN', 'USD', 'EUR', 'GBP'] })
  @IsEnum(['NGN', 'USD', 'EUR', 'GBP'])
  currency: CurrencyCode;
}

