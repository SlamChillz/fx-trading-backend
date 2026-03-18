import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Transaction, TransactionType, TransactionStatus } from './transaction.entity';
import { Wallet } from '../wallet/wallet.entity';
import type {
  DailyTrendRow,
  TransactionAnalyticsResponse,
  TypeDetailRow,
  VolumeByCurrencyRow,
} from './dto/transaction-analytics.dto';

const ALL_STATUSES: TransactionStatus[] = ['PENDING', 'COMPLETED', 'FAILED'];
const ALL_TYPES: TransactionType[] = ['FUND', 'CONVERT', 'TRADE'];

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
  ) {}

  listForUser(
    userId: string,
    filters: { type?: TransactionType; status?: TransactionStatus },
    pagination: { page?: number; limit?: number },
  ) {
    this.logger.log(
      `listForUser start userId=${userId} type=${filters.type || '-'} status=${filters.status || '-'} page=${pagination.page || 1} limit=${pagination.limit || 20}`,
    );
    return this.walletRepo
      .findOne({
        where: { user: { id: userId } },
      })
      .then((wallet) => {
        if (!wallet) {
          this.logger.warn(`listForUser no wallet found userId=${userId}`);
          return [[], 0] as [Transaction[], number];
        }

        this.logger.log(`listForUser wallet resolved userId=${userId} walletId=${wallet.id}`);

        const qb = this.txRepo
          .createQueryBuilder('tx')
          .innerJoin('tx.wallet', 'wallet')
          .where('wallet.id = :walletId', { walletId: wallet.id })
          .orderBy('tx.createdAt', 'DESC');

    if (filters.type) {
      qb.andWhere('tx.type = :type', { type: filters.type });
    }
    if (filters.status) {
      qb.andWhere('tx.status = :status', { status: filters.status });
    }

        const page = pagination.page && pagination.page > 0 ? pagination.page : 1;
        const limit = pagination.limit && pagination.limit > 0 ? Math.min(pagination.limit, 100) : 20;
        qb.skip((page - 1) * limit).take(limit);

        return qb.getManyAndCount().then(([items, total]) => {
          this.logger.log(
            `listForUser done userId=${userId} walletId=${wallet.id} total=${total} returned=${items.length}`,
          );
          return [items, total] as [Transaction[], number];
        });
      });
  }

  private applyDateRange(
    qb: SelectQueryBuilder<Transaction>,
    from?: Date,
    to?: Date,
  ): SelectQueryBuilder<Transaction> {
    if (from) {
      qb.andWhere('tx.createdAt >= :from', { from });
    }
    if (to) {
      qb.andWhere('tx.createdAt <= :to', { to });
    }
    return qb;
  }

  /**
   * Admin analytics: summary, volume by currency, type breakdown, optional daily trends.
   */
  async analytics(
    from?: Date,
    to?: Date,
    includeDaily = false,
  ): Promise<TransactionAnalyticsResponse> {
    const base = () => this.applyDateRange(this.txRepo.createQueryBuilder('tx'), from, to);

    const [summaryRow, statusRows, typeRows, typeStatusRows, currencyRows, dailyRows] =
      await Promise.all([
        base()
          .select('COUNT(tx.id)', 'total')
          .addSelect('COUNT(DISTINCT tx.walletId)', 'uniqueWallets')
          .getRawOne<{ total: string; uniqueWallets: string }>(),
        base()
          .select('tx.status', 'status')
          .addSelect('COUNT(*)', 'count')
          .groupBy('tx.status')
          .getRawMany<{ status: TransactionStatus; count: string }>(),
        base()
          .select('tx.type', 'type')
          .addSelect('COUNT(*)', 'count')
          .groupBy('tx.type')
          .getRawMany<{ type: TransactionType; count: string }>(),
        base()
          .select('tx.type', 'type')
          .addSelect('tx.status', 'status')
          .addSelect('COUNT(*)', 'count')
          .addSelect(`SUM(CAST(tx."amountFrom" AS numeric))`, 'totalAmountFrom')
          .groupBy('tx.type')
          .addGroupBy('tx.status')
          .getRawMany<{
            type: TransactionType;
            status: TransactionStatus;
            count: string;
            totalAmountFrom: string;
          }>(),
        base()
          .select('tx.currencyFrom', 'currencyFrom')
          .addSelect('COUNT(*)', 'transactionCount')
          .addSelect(
            `SUM(CASE WHEN tx.status = 'COMPLETED' THEN 1 ELSE 0 END)`,
            'completedCount',
          )
          .addSelect(`SUM(CASE WHEN tx.status = 'FAILED' THEN 1 ELSE 0 END)`, 'failedCount')
          .addSelect(`SUM(CASE WHEN tx.status = 'PENDING' THEN 1 ELSE 0 END)`, 'pendingCount')
          .addSelect(
            `SUM(CASE WHEN tx.status = 'COMPLETED' THEN CAST(tx."amountFrom" AS numeric) ELSE 0 END)`,
            'totalAmountFromCompleted',
          )
          .addSelect(`SUM(CAST(tx."amountFrom" AS numeric))`, 'totalAmountFromAll')
          .groupBy('tx.currencyFrom')
          .getRawMany<{
            currencyFrom: string;
            transactionCount: string;
            completedCount: string;
            failedCount: string;
            pendingCount: string;
            totalAmountFromCompleted: string;
            totalAmountFromAll: string;
          }>(),
        includeDaily &&
        from &&
        to &&
        to.getTime() - from.getTime() <= 366 * 24 * 60 * 60 * 1000
          ? this.applyDateRange(this.txRepo.createQueryBuilder('tx'), from, to)
              .select(`to_char(date_trunc('day', tx."createdAt"), 'YYYY-MM-DD')`, 'day')
              .addSelect('COUNT(*)', 'transactionCount')
              .addSelect(
                `SUM(CASE WHEN tx.status = 'COMPLETED' THEN 1 ELSE 0 END)`,
                'completedCount',
              )
              .addSelect(`SUM(CASE WHEN tx.status = 'FAILED' THEN 1 ELSE 0 END)`, 'failedCount')
              .addSelect(`SUM(CASE WHEN tx.status = 'PENDING' THEN 1 ELSE 0 END)`, 'pendingCount')
              .addSelect(
                `SUM(CASE WHEN tx.status = 'COMPLETED' THEN CAST(tx."amountFrom" AS numeric) ELSE 0 END)`,
                'totalAmountFromCompleted',
              )
              .groupBy(`date_trunc('day', tx."createdAt")`)
              .addGroupBy(`to_char(date_trunc('day', tx."createdAt"), 'YYYY-MM-DD')`)
              .orderBy(`date_trunc('day', tx."createdAt")`, 'ASC')
              .getRawMany<{
                day: string;
                transactionCount: string;
                completedCount: string;
                failedCount: string;
                pendingCount: string;
                totalAmountFromCompleted: string;
              }>()
          : Promise.resolve([] as DailyTrendRow[]),
      ]);

    const totalTransactions = Number(summaryRow?.total ?? 0);
    const uniqueWallets = Number(summaryRow?.uniqueWallets ?? 0);

    const byStatus: Record<string, number> = {};
    for (const s of ALL_STATUSES) {
      byStatus[s] = 0;
    }
    for (const row of statusRows) {
      byStatus[row.status] = Number(row.count);
    }

    const byTypeCount: Record<string, number> = {};
    for (const t of ALL_TYPES) {
      byTypeCount[t] = 0;
    }
    for (const row of typeRows) {
      byTypeCount[row.type] = Number(row.count);
    }

    const completedCount = byStatus['COMPLETED'] ?? 0;
    const completionRateByCount =
      totalTransactions > 0 ? completedCount / totalTransactions : null;

    let sumAllVolume = 0;
    let sumCompletedVolume = 0;
    for (const row of currencyRows) {
      sumAllVolume += parseFloat(row.totalAmountFromAll || '0') || 0;
      sumCompletedVolume += parseFloat(row.totalAmountFromCompleted || '0') || 0;
    }
    const completionRateByVolume =
      sumAllVolume > 0 ? sumCompletedVolume / sumAllVolume : null;

    const byTypeDetailMap = new Map<
      TransactionType,
      { byStatus: Record<TransactionStatus, number>; amountAll: number; amountCompleted: number }
    >();
    for (const t of ALL_TYPES) {
      byTypeDetailMap.set(t, {
        byStatus: { PENDING: 0, COMPLETED: 0, FAILED: 0 },
        amountAll: 0,
        amountCompleted: 0,
      });
    }
    for (const row of typeStatusRows) {
      const entry = byTypeDetailMap.get(row.type)!;
      entry.byStatus[row.status] = Number(row.count);
      entry.amountAll += parseFloat(row.totalAmountFrom || '0') || 0;
      if (row.status === 'COMPLETED') {
        entry.amountCompleted += parseFloat(row.totalAmountFrom || '0') || 0;
      }
    }

    const byType: TypeDetailRow[] = ALL_TYPES.map((type) => {
      const d = byTypeDetailMap.get(type)!;
      const totalCount = ALL_STATUSES.reduce((acc, st) => acc + (d.byStatus[st] ?? 0), 0);
      return {
        type,
        totalCount,
        byStatus: d.byStatus,
        totalAmountFromAll: d.amountAll.toFixed(2),
        totalAmountFromCompleted: d.amountCompleted.toFixed(2),
      };
    });

    const volumeByCurrency: VolumeByCurrencyRow[] = currencyRows
      .map((row) => ({
        currencyFrom: row.currencyFrom,
        transactionCount: Number(row.transactionCount),
        completedCount: Number(row.completedCount),
        failedCount: Number(row.failedCount),
        pendingCount: Number(row.pendingCount),
        totalAmountFromCompleted: normalizeNumericString(row.totalAmountFromCompleted),
        totalAmountFromAll: normalizeNumericString(row.totalAmountFromAll),
      }))
      .sort((a, b) => b.transactionCount - a.transactionCount);

    const dailyTrendsMapped: DailyTrendRow[] = (
      dailyRows as unknown as Array<Record<string, string>>
    ).map((row) => ({
      day: row.day,
      transactionCount: Number(row.transactionCount),
      completedCount: Number(row.completedCount),
      failedCount: Number(row.failedCount),
      pendingCount: Number(row.pendingCount),
      totalAmountFromCompleted: normalizeNumericString(row.totalAmountFromCompleted),
    }));

    const notes: string[] = [];
    if (
      includeDaily &&
      from &&
      to &&
      to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000
    ) {
      notes.push('dailyTrends omitted: date range exceeds 366 days');
    }

    return {
      period: {
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
      },
      summary: {
        totalTransactions,
        uniqueWallets,
        byStatus: byStatus as TransactionAnalyticsResponse['summary']['byStatus'],
        byType: byTypeCount as TransactionAnalyticsResponse['summary']['byType'],
        completionRateByCount,
        completionRateByVolume,
      },
      volumeByCurrency,
      byType,
      ...(dailyTrendsMapped.length > 0 ? { dailyTrends: dailyTrendsMapped } : {}),
      ...(notes.length > 0 ? { notes } : {}),
    } satisfies TransactionAnalyticsResponse;
  }
}

function normalizeNumericString(v: string | null | undefined): string {
  if (v == null || v === '') {
    return '0.00';
  }
  const n = parseFloat(v);
  if (Number.isNaN(n)) {
    return '0.00';
  }
  return n.toFixed(2);
}

