import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Wallet } from './wallet.entity';

export type CurrencyCode = 'NGN' | 'USD' | 'EUR' | 'GBP';

/** All currencies exposed on GET /wallet (zeros when no row yet). */
export const SUPPORTED_CURRENCIES: CurrencyCode[] = ['NGN', 'USD', 'EUR', 'GBP'];

/** Shape returned by getBalances (always one entry per supported currency). */
export type WalletBalanceItem = {
  currency: CurrencyCode;
  balance: string;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

@Entity()
@Index(['wallet', 'currency'], { unique: true })
export class WalletBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Wallet, (wallet) => wallet.balances)
  wallet: Wallet;

  @Column({ type: 'varchar' })
  currency: CurrencyCode;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  balance: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

