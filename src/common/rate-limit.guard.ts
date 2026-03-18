import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import Redis from 'ioredis';
import { RATE_LIMIT_KEY, RateLimitOptions } from './rate-limit.decorator';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private redisClient: Redis | null = null;

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {
    const host = this.configService.get<string>('REDIS_HOST');
    const port = Number(this.configService.get<string>('REDIS_PORT') || 6379);
    if (host) {
      this.redisClient = new Redis({
        host,
        port,
        lazyConnect: true,
      });
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no rate limit metadata, allow request.
    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest() as any;
    const ip = request.ip || request.headers['x-forwarded-for'] || 'unknown';
    const method = request.method;
    const path = request.route?.path || request.url || 'unknown';

    // If Redis is not configured, we skip rate limiting but allow the request.
    if (!this.redisClient) {
      return true;
    }

    const key = `rl:${method}:${path}:${ip}`;
    const windowMs = options.windowSec * 1000;

    try {
      if (!this.redisClient.status || this.redisClient.status === 'wait') {
        await this.redisClient.connect();
      }
      const now = Date.now();
      const ttlMs = await this.redisClient.pttl(key);
      let count: number;

      if (ttlMs <= 0) {
        // New window
        await this.redisClient.set(key, '1', 'PX', windowMs);
        count = 1;
      } else {
        count = await this.redisClient.incr(key);
      }

      if (count > options.limit) {
        throw new HttpException(
          `Rate limit exceeded. Try again in ${Math.ceil(windowMs / 1000)}s`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (err) {
      // If Redis errors, fail open (do not block traffic).
      return true;
    }
  }
}

