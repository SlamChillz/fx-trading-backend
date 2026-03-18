import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './users/user.entity';
import { OtpVerification } from './auth/otp-verification.entity';
import { Wallet } from './wallet/wallet.entity';
import { WalletBalance } from './wallet/wallet-balance.entity';
import { Transaction } from './transactions/transaction.entity';
import { FxRateSnapshot } from './fx/fx-rate-snapshot.entity';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MailModule } from './mail/mail.module';
import { WalletModule } from './wallet/wallet.module';
import { FxModule } from './fx/fx.module';
import { TransactionsModule } from './transactions/transactions.module';
import { TracingInterceptor } from './common/tracing.interceptor';
import { RateLimitGuard } from './common/rate-limit.guard';
import { APP_GUARD } from '@nestjs/core';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 5432,
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'fx_trading',
        entities: [
          User,
          OtpVerification,
          Wallet,
          WalletBalance,
          Transaction,
          FxRateSnapshot,
        ],
        synchronize: true,
      }),
    }),
    AuthModule,
    UsersModule,
    MailModule,
    WalletModule,
    FxModule,
    TransactionsModule,
    HealthModule,
  ],
  controllers: [],
  providers: [
    TracingInterceptor,
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
})
export class AppModule {}
