import { IsEnum, IsNumber, IsPositive } from 'class-validator';
import { CurrencyCode } from '../wallet-balance.entity';
import { ApiProperty } from '@nestjs/swagger';

export class ConvertDto {
  @ApiProperty({ example: 'NGN', enum: ['NGN', 'USD', 'EUR', 'GBP'] })
  @IsEnum(['NGN', 'USD', 'EUR', 'GBP'])
  fromCurrency: CurrencyCode;

  @ApiProperty({ example: 'USD', enum: ['NGN', 'USD', 'EUR', 'GBP'] })
  @IsEnum(['NGN', 'USD', 'EUR', 'GBP'])
  toCurrency: CurrencyCode;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  @IsPositive()
  amount: number;
}

