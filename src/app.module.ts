import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './users/user.entity';
import { OtpVerification } from './auth/otp-verification.entity';
import { TracingInterceptor } from './common/tracing.interceptor';
import { RateLimitGuard } from './common/rate-limit.guard';
import { APP_GUARD } from '@nestjs/core';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';

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
        entities: [User, OtpVerification],
        synchronize: true,
      }),
    }),
    AuthModule,
    UsersModule,
    MailModule,
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
