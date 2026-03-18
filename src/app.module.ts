import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TracingInterceptor } from './common/tracing.interceptor';
import { RateLimitGuard } from './common/rate-limit.guard';
import { APP_GUARD } from '@nestjs/core';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
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
