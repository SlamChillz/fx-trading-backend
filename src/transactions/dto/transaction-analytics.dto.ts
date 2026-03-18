import { TransactionStatus, TransactionType } from '../transaction.entity';

/** Counts per status (missing keys imply 0). */
export type StatusBreakdown = Partial<Record<TransactionStatus, number>>;

/** Counts per type (missing keys imply 0). */
export type TypeBreakdown = Partial<Record<TransactionType, number>>;

export interface TypeStatusRow {
  type: TransactionType;
  status: TransactionStatus;
  count: number;
  /** Sum of amountFrom for rows in this bucket (numeric string from DB). */
  totalAmountFrom: string;
}

export interface VolumeByCurrencyRow {
  currencyFrom: string;
  transactionCount: number;
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  /** Sum amountFrom where status = COMPLETED */
  totalAmountFromCompleted: string;
  /** Sum amountFrom (all statuses) */
  totalAmountFromAll: string;
}

export interface DailyTrendRow {
  /** ISO date YYYY-MM-DD (UTC day boundary). */
  day: string;
  transactionCount: number;
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  totalAmountFromCompleted: string;
}

export interface TypeDetailRow {
  type: TransactionType;
  totalCount: number;
  byStatus: StatusBreakdown;
  totalAmountFromAll: string;
  totalAmountFromCompleted: string;
}

export interface TransactionAnalyticsResponse {
  period: {
    from: string | null;
    to: string | null;
  };
  summary: {
    totalTransactions: number;
    uniqueWallets: number;
    byStatus: StatusBreakdown;
    byType: TypeBreakdown;
    /** Share of completed tx by count (0–1), null if no transactions. */
    completionRateByCount: number | null;
    /** Share of completed volume (by amountFrom on completed vs all), null if no volume. */
    completionRateByVolume: number | null;
  };
  /** Per outgoing currency (currencyFrom). */
  volumeByCurrency: VolumeByCurrencyRow[];
  /** Per transaction type with status split and amounts. */
  byType: TypeDetailRow[];
  /** Only present when includeDaily=true, both from & to are set, and range ≤ 366 days. */
  dailyTrends?: DailyTrendRow[];
  /** e.g. when daily trends were skipped due to range limits. */
  notes?: string[];
}
