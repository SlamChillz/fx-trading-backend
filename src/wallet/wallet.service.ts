import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Wallet } from './wallet.entity';
import {
  WalletBalance,
  CurrencyCode,
  SUPPORTED_CURRENCIES,
  WalletBalanceItem,
} from './wallet-balance.entity';
import { Transaction } from '../transactions/transaction.entity';
import { UsersService } from '../users/users.service';
import { FxService } from '../fx/fx.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class WalletService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(WalletBalance)
    private readonly balanceRepo: Repository<WalletBalance>,
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    private readonly usersService: UsersService,
    private readonly fxService: FxService,
    private readonly mailService: MailService,
  ) {}

  async getOrCreateWalletForUser(userId: string) {
    let wallet = await this.walletRepo.findOne({
      where: { user: { id: userId } },
      relations: ['balances'],
    });
    if (!wallet) {
      const user = await this.usersService.findById(userId);
      if (!user) {
        throw new NotFoundException('User not found');
      }
      wallet = this.walletRepo.create({ user });
      wallet = await this.walletRepo.save(wallet);
    }
    return wallet;
  }

  async getBalances(userId: string): Promise<WalletBalanceItem[]> {
    const wallet = await this.walletRepo.findOne({
      where: { user: { id: userId } },
      relations: ['balances'],
    });
    const byCurrency = new Map<CurrencyCode, WalletBalance>();
    if (wallet?.balances?.length) {
      for (const b of wallet.balances) {
        byCurrency.set(b.currency, b);
      }
    }
    return SUPPORTED_CURRENCIES.map((currency) => {
      const row = byCurrency.get(currency);
      if (row) {
        return {
          currency: row.currency,
          balance: formatBalanceAmount(row.balance),
          id: row.id,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      }
      return { currency, balance: '0.00' };
    });
  }

  async fund(userId: string, amount: number, currency: CurrencyCode, idempotencyKey?: string) {
    return this.dataSource.transaction(async (manager) => {
      const walletRepo = manager.getRepository(Wallet);
      const balanceRepo = manager.getRepository(WalletBalance);
      const txRepo = manager.getRepository(Transaction);

      let wallet = await walletRepo.findOne({
        where: { user: { id: userId } },
        relations: ['user'],
      });
      if (!wallet) {
        const user = await this.usersService.findById(userId);
        if (!user) {
          throw new NotFoundException('User not found');
        }
        wallet = walletRepo.create({ user });
        wallet = await walletRepo.save(wallet);
      }

      if (idempotencyKey) {
        const existingTx = await txRepo.findOne({
          where: { wallet: { id: wallet.id }, idempotencyKey },
        });
        if (existingTx) {
          return existingTx;
        }
      }

      let balance = await balanceRepo.findOne({
        where: { wallet: { id: wallet.id }, currency },
        lock: { mode: 'pessimistic_write' },
      });
      if (!balance) {
        balance = balanceRepo.create({ wallet, currency, balance: '0' });
      }
      const current = Number(balance.balance);
      balance.balance = (current + amount).toFixed(2);
      await balanceRepo.save(balance);

      const tx = txRepo.create({
        wallet,
        type: 'FUND',
        status: 'COMPLETED',
        amountFrom: amount.toFixed(2),
        currencyFrom: currency,
        amountTo: null,
        currencyTo: null,
        rate: null,
        idempotencyKey: idempotencyKey || null,
      });
      const saved = await txRepo.save(tx);
      this.stripSensitiveUser(saved);

      const email = wallet.user?.email;
      if (email) {
        void this.mailService.sendFundingNotification(email, amount, currency);
      }

      return saved;
    });
  }

  async convert(
    userId: string,
    fromCurrency: CurrencyCode,
    toCurrency: CurrencyCode,
    amount: number,
    idempotencyKey?: string,
    asTrade = false,
  ) {
    if (fromCurrency === toCurrency) {
      throw new BadRequestException('fromCurrency and toCurrency must differ');
    }
    const ratesResult = await this.fxService.getRates('NGN');
    const rates = ratesResult.rates;
    const type = asTrade ? 'TRADE' : 'CONVERT';

    return this.dataSource.transaction(async (manager) => {
      const walletRepo = manager.getRepository(Wallet);
      const balanceRepo = manager.getRepository(WalletBalance);
      const txRepo = manager.getRepository(Transaction);

      const wallet = await walletRepo.findOne({
        where: { user: { id: userId } },
        relations: ['user'],
      });
      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (idempotencyKey) {
        const existingTx = await txRepo.findOne({
          where: { wallet: { id: wallet.id }, idempotencyKey },
        });
        if (existingTx) {
          return existingTx;
        }
      }

      const fromBalance = await balanceRepo.findOne({
        where: { wallet: { id: wallet.id }, currency: fromCurrency },
        lock: { mode: 'pessimistic_write' },
      });
      if (!fromBalance || Number(fromBalance.balance) < amount) {
        throw new BadRequestException('Insufficient balance');
      }

      const rate = this.computeRate(rates, fromCurrency, toCurrency);
      const amountTo = amount * rate;

      fromBalance.balance = (Number(fromBalance.balance) - amount).toFixed(2);
      await balanceRepo.save(fromBalance);

      let toBalance = await balanceRepo.findOne({
        where: { wallet: { id: wallet.id }, currency: toCurrency },
        lock: { mode: 'pessimistic_write' },
      });
      if (!toBalance) {
        toBalance = balanceRepo.create({ wallet, currency: toCurrency, balance: '0' });
      }
      toBalance.balance = (Number(toBalance.balance) + amountTo).toFixed(2);
      await balanceRepo.save(toBalance);

      const tx = txRepo.create({
        wallet,
        type,
        status: 'COMPLETED',
        amountFrom: amount.toFixed(2),
        currencyFrom: fromCurrency,
        amountTo: amountTo.toFixed(2),
        currencyTo: toCurrency,
        rate: rate.toFixed(6),
        idempotencyKey: idempotencyKey || null,
        metadata: {
          fxBase: 'NGN',
          ratesSnapshotAt: ratesResult.fetchedAt,
        },
      });
      const saved = await txRepo.save(tx);
      this.stripSensitiveUser(saved);

      const email = (wallet as any).user?.email as string | undefined;
      if (email) {
        const numericRate = Number(rate);
        const numericAmountTo = amountTo;
        if (type === 'TRADE' || type === 'CONVERT') {
          void this.mailService.sendConversionNotification(
            email,
            type,
            fromCurrency,
            toCurrency,
            amount,
            numericAmountTo,
            numericRate,
          );
        }
      }

      return saved;
    });
  }

  private stripSensitiveUser(tx: Transaction) {
    if (tx.wallet && (tx.wallet as any).user) {
      const user: any = (tx.wallet as any).user;
      if (user.passwordHash) {
        delete user.passwordHash;
      }
    }
  }

  private computeRate(rates: Record<string, number>, from: CurrencyCode, to: CurrencyCode): number {
    if (from === to) return 1;
    if (from === 'NGN') {
      const direct = rates[to];
      if (!direct) {
        throw new BadRequestException('Unsupported currency pair');
      }
      return direct;
    }
    if (to === 'NGN') {
      const fromRate = rates[from];
      if (!fromRate) {
        throw new BadRequestException('Unsupported currency pair');
      }
      return 1 / fromRate;
    }
    const fromRate = rates[from];
    const toRate = rates[to];
    if (!fromRate || !toRate) {
      throw new BadRequestException('Unsupported currency pair');
    }
    return toRate / fromRate;
  }
}

function formatBalanceAmount(value: string): string {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

