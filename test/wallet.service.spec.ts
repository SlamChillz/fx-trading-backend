import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { WalletService } from '../src/wallet/wallet.service';
import { Wallet } from '../src/wallet/wallet.entity';
import { WalletBalance, SUPPORTED_CURRENCIES } from '../src/wallet/wallet-balance.entity';
import { Transaction } from '../src/transactions/transaction.entity';
import { UsersService } from '../src/users/users.service';
import { FxService } from '../src/fx/fx.service';
import { MailService } from '../src/mail/mail.service';

describe('WalletService', () => {
  let service: WalletService;
  let walletRepo: jest.Mocked<Partial<Repository<Wallet>>>;
  let balanceRepo: jest.Mocked<Partial<Repository<WalletBalance>>>;
  let txRepo: jest.Mocked<Partial<Repository<Transaction>>>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        WalletService,
        {
          provide: DataSource,
          useValue: {
            transaction: (fn: any) =>
              fn({
                getRepository: (entity: any) => {
                  if (entity === Wallet) return walletRepo;
                  if (entity === WalletBalance) return balanceRepo;
                  if (entity === Transaction) return txRepo;
                  throw new Error('Unknown repo');
                },
              }),
          },
        },
        {
          provide: getRepositoryToken(Wallet),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(WalletBalance),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findById: jest.fn(),
          },
        },
        {
          provide: FxService,
          useValue: {
            getRates: jest.fn(),
          },
        },
        {
          provide: MailService,
          useValue: {
            sendFundingNotification: jest.fn(),
            sendConversionNotification: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(WalletService);
    walletRepo = moduleRef.get(getRepositoryToken(Wallet));
    balanceRepo = moduleRef.get(getRepositoryToken(WalletBalance));
    txRepo = moduleRef.get(getRepositoryToken(Transaction));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('fund should create or update a balance and record a transaction', async () => {
    const userId = 'user-1';
    const wallet: Partial<Wallet> = { id: 'wallet-1' } as Wallet;
    const balance: Partial<WalletBalance> = { id: 'balance-1', balance: '0', currency: 'NGN' } as WalletBalance;
    const tx: Partial<Transaction> = { id: 'tx-1' } as Transaction;

    (walletRepo.findOne as jest.Mock).mockResolvedValueOnce(wallet as Wallet);
    (balanceRepo.findOne as jest.Mock).mockResolvedValueOnce(balance as WalletBalance);
    (balanceRepo.save as jest.Mock).mockResolvedValueOnce({ ...balance, balance: '100.00' } as WalletBalance);
    (txRepo.create as jest.Mock).mockReturnValue(tx as Transaction);
    (txRepo.save as jest.Mock).mockResolvedValueOnce(tx as Transaction);

    const result = await service.fund(userId, 100, 'NGN', 'idem-1');
    expect(result).toBe(tx);
    expect(balanceRepo.save).toHaveBeenCalled();
    expect(txRepo.create).toHaveBeenCalled();
  });

  it('convert should throw when from and to currencies are the same', async () => {
    await expect(
      service.convert('user-1', 'NGN', 'NGN', 100, undefined, false),
    ).rejects.toThrow(/must differ/);
  });

  describe('getBalances', () => {
    it('returns zero for all supported currencies when user has no wallet', async () => {
      (walletRepo.findOne as jest.Mock).mockResolvedValueOnce(null);

      const balances = await service.getBalances('user-1');

      expect(balances).toHaveLength(SUPPORTED_CURRENCIES.length);
      expect(balances.map((b) => b.currency)).toEqual(SUPPORTED_CURRENCIES);
      expect(balances.every((b) => b.balance === '0.00')).toBe(true);
      expect(balances.every((b) => b.id === undefined)).toBe(true);
    });

    it('returns zero for missing currencies when wallet has no balance rows', async () => {
      (walletRepo.findOne as jest.Mock).mockResolvedValueOnce({
        id: 'w1',
        balances: [],
      } as Wallet);

      const balances = await service.getBalances('user-1');

      expect(balances).toHaveLength(4);
      expect(balances.every((b) => b.balance === '0.00')).toBe(true);
    });

    it('merges DB rows with zero placeholders for unfunded currencies', async () => {
      const createdAt = new Date('2026-01-01');
      const updatedAt = new Date('2026-01-02');
      (walletRepo.findOne as jest.Mock).mockResolvedValueOnce({
        id: 'w1',
        balances: [
          {
            id: 'b-ngn',
            currency: 'NGN',
            balance: '5000.5',
            createdAt,
            updatedAt,
          } as WalletBalance,
        ],
      } as Wallet);

      const balances = await service.getBalances('user-1');

      const ngn = balances.find((b) => b.currency === 'NGN');
      expect(ngn).toMatchObject({
        currency: 'NGN',
        balance: '5000.50',
        id: 'b-ngn',
        createdAt,
        updatedAt,
      });
      for (const c of ['USD', 'EUR', 'GBP'] as const) {
        const row = balances.find((b) => b.currency === c);
        expect(row).toEqual({ currency: c, balance: '0.00' });
      }
    });
  });
});

