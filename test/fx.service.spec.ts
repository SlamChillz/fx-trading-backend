import { Test } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FxService } from '../src/fx/fx.service';
import { FxRateSnapshot } from '../src/fx/fx-rate-snapshot.entity';
import { MailService } from '../src/mail/mail.service';

describe('FxService', () => {
  let service: FxService;
  let httpService: jest.Mocked<HttpService>;
  let configService: jest.Mocked<ConfigService>;
  let snapshotRepo: Repository<FxRateSnapshot>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        FxService,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'FX_CACHE_TTL_MS') return '60000';
              if (key === 'FX_HTTP_TIMEOUT_MS') return '5000';
              if (key === 'FX_MAX_FAILURES') return '5';
              if (key === 'FX_CIRCUIT_OPEN_MS') return '30000';
              if (key === 'FX_API_URL') return 'https://api.exchangerate.host/live';
              if (key === 'FX_SUPPORTED_CURRENCIES') return 'NGN,USD,EUR,GBP';
              return undefined;
            }),
          },
        },
        {
          provide: getRepositoryToken(FxRateSnapshot),
          useClass: Repository,
        },
        {
          provide: MailService,
          useValue: {
            sendErrorAlert: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(FxService);
    httpService = moduleRef.get(HttpService) as any;
    configService = moduleRef.get(ConfigService) as any;
    snapshotRepo = moduleRef.get(getRepositoryToken(FxRateSnapshot));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('fetches rates from HTTP when cache empty and transforms quotes', async () => {
    const httpResponse = {
      data: {
        success: true,
        source: 'NGN',
        quotes: {
          NGNUSD: 0.00062,
          NGNEUR: 0.00054,
        },
      },
    };
    (httpService.get as jest.Mock).mockReturnValueOnce(of(httpResponse));

    const snapshotCreateSpy = jest.spyOn(snapshotRepo, 'create').mockReturnValue({} as any);
    const snapshotSaveSpy = jest.spyOn(snapshotRepo, 'save').mockResolvedValue({} as any);

    const result = await service.getRates('NGN');

    expect(httpService.get).toHaveBeenCalled();
    expect(result.base).toBe('NGN');
    expect(result.rates).toEqual({ USD: 0.00062, EUR: 0.00054 });
    expect(snapshotCreateSpy).toHaveBeenCalled();
    expect(snapshotSaveSpy).toHaveBeenCalled();
  });

  it('throws when FX API returns error payload', async () => {
    (httpService.get as jest.Mock).mockReturnValueOnce(
      of({
        data: {
          success: false,
          source: 'NGN',
          quotes: {},
          error: { code: 101, info: 'invalid key' },
        },
      }),
    );

    await expect(service.getRates('NGN')).rejects.toThrow('Unable to fetch FX rates');
  });
});

