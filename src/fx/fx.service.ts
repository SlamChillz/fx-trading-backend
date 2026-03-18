import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FxRateSnapshot } from './fx-rate-snapshot.entity';
import { MailService } from '../mail/mail.service';
import Redis from 'ioredis';

interface FxApiResponse {
  success: boolean;
  source: string;
  quotes: Record<string, number>;
  error?: { code: number; info: string };
}

@Injectable()
export class FxService {
  private readonly logger = new Logger(FxService.name);
  private redisClient: Redis | null = null;
  private failureCount = 0;
  private circuitOpenUntil = 0;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    @InjectRepository(FxRateSnapshot)
    private readonly snapshotRepo: Repository<FxRateSnapshot>,
    private readonly mailService: MailService,
  ) {
    const host = this.config.get<string>('REDIS_HOST');
    const port = Number(this.config.get<string>('REDIS_PORT') || 6379);
    if (host) {
      this.redisClient = new Redis({
        host,
        port,
        lazyConnect: true,
      });
    }
  }

  async getRates(base = 'NGN') {
    const ttlMs = Number(this.config.get<string>('FX_CACHE_TTL_MS') || 60_000);
    const timeoutMs = Number(this.config.get<string>('FX_HTTP_TIMEOUT_MS') || 5000);
    const maxFailures = Number(this.config.get<string>('FX_MAX_FAILURES') || 5);
    const circuitOpenMs = Number(this.config.get<string>('FX_CIRCUIT_OPEN_MS') || 30000);

    const now = Date.now();
    const cacheKey = `fx:${base}`;

    // Try Redis cache first if configured
    if (this.redisClient) {
      try {
        if (!this.redisClient.status || this.redisClient.status === 'wait') {
          await this.redisClient.connect();
        }
        const cached = await this.redisClient.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as { base: string; rates: Record<string, number>; fetchedAt: number };
          return {
            base: parsed.base,
            rates: parsed.rates,
            fetchedAt: new Date(parsed.fetchedAt),
            fromCache: true,
            cacheLayer: 'redis',
          };
        }
      } catch (err) {
        this.logger.warn(`Redis cache unavailable, continuing without cache: ${(err as Error).message}`);
      }
    }

    if (this.circuitOpenUntil && now < this.circuitOpenUntil) {
      this.logger.warn(
        `FX circuit breaker open; skipping external call (until ${new Date(
          this.circuitOpenUntil,
        ).toISOString()})`,
      );
      throw new ServiceUnavailableException('FX rates service temporarily unavailable');
    }

    try {
      const apiKey = this.config.get<string>('FX_API_KEY');
      const apiUrl = this.config.get<string>('FX_API_URL');
      if (!apiUrl) {
        throw new Error('FX_API_URL not configured');
      }

      // Build request for exchangerate.host /live-style API
      // Docs: https://exchangerate.host/documentation
      const supportedCurrencies =
        this.config.get<string>('FX_SUPPORTED_CURRENCIES') || 'NGN,USD,EUR,GBP';

      const params = new URLSearchParams();
      if (apiKey) {
        params.append('access_key', apiKey);
      }
      params.append('source', base);
      params.append('currencies', supportedCurrencies);

      const url = `${apiUrl}?${params.toString()}`;
      const response = await firstValueFrom(
        this.http.get<FxApiResponse>(url, {
          timeout: timeoutMs,
        }),
      );
      const data = response.data;

      if (!data || data.success === false) {
        const reason = data?.error?.info || 'Unknown FX API error';
        this.logger.error(`FX API returned error: ${reason}`);
        throw new Error(reason);
      }

      if (typeof data.source !== 'string' || !data.quotes || Object.keys(data.quotes).length === 0) {
        this.logger.error(
          `FX API returned invalid payload: ${JSON.stringify({
            receivedSource: data && (data as any).source,
            hasQuotes: !!(data && (data as any).quotes),
          })}`,
        );
        throw new Error('Invalid FX API response');
      }

      // Transform quotes like "NGNUSD": 0.00062 into rates map { USD: 0.00062 }
      const rates: Record<string, number> = {};
      for (const [pair, rate] of Object.entries(data.quotes)) {
        if (typeof rate !== 'number') continue;
        if (!pair.startsWith(data.source)) continue;
        const target = pair.slice(data.source.length);
        if (target) {
          rates[target] = rate;
        }
      }

      if (Object.keys(rates).length === 0) {
        throw new Error('No FX rates could be derived from quotes');
      }

      // Write-through to Redis if available
      if (this.redisClient) {
        try {
          if (!this.redisClient.status || this.redisClient.status === 'wait') {
            await this.redisClient.connect();
          }
          await this.redisClient.set(
            cacheKey,
            JSON.stringify({
              base: data.source,
              rates,
              fetchedAt: Date.now(),
            }),
            'PX',
            ttlMs,
          );
        } catch (err) {
          this.logger.warn(`Failed to write FX rates to Redis cache: ${(err as Error).message}`);
        }
      }

      try {
        const snapshot = this.snapshotRepo.create({
          baseCurrency: data.source,
          rates,
          source: apiUrl,
        });
        await this.snapshotRepo.save(snapshot);
      } catch (e) {
        // Snapshot persistence failure should not break live FX usage
        this.logger.warn(`Failed to persist FX snapshot: ${(e as Error).message}`);
      }

      this.failureCount = 0;
      this.circuitOpenUntil = 0;

      return {
        base: data.source,
        rates,
        fetchedAt: new Date(),
        fromCache: false,
        cacheLayer: this.redisClient ? 'redis' : 'memory',
      };
    } catch (error) {
      this.logger.error('Failed to fetch FX rates', error as Error);
      this.failureCount += 1;
      if (this.failureCount >= maxFailures) {
        this.circuitOpenUntil = Date.now() + circuitOpenMs;
        this.logger.warn(
          `FX circuit opened for ${circuitOpenMs}ms after ${this.failureCount} consecutive failures`,
        );
        void this.mailService.sendErrorAlert(
          'FX circuit opened',
          [
            'FX rate fetching is failing consistently.',
            `Base: ${base}`,
            `Failure count: ${this.failureCount}`,
            `Circuit open for: ${circuitOpenMs}ms`,
            `Error: ${(error as Error)?.message || String(error)}`,
          ].join('\n'),
        );
      }
      throw new ServiceUnavailableException('Unable to fetch FX rates, please try again later');
    }
  }
}

