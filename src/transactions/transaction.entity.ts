import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Wallet } from '../wallet/wallet.entity';

export type TransactionType = 'FUND' | 'CONVERT' | 'TRADE';
export type TransactionStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

@Entity()
@Index(['wallet', 'createdAt'])
@Index(['wallet', 'type', 'createdAt'])
@Index(['wallet', 'idempotencyKey'], { unique: true, where: '"idempotencyKey" IS NOT NULL' })
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Wallet, (wallet) => wallet.transactions)
  wallet: Wallet;

  @Column({ type: 'varchar' })
  type: TransactionType;

  @Column({ type: 'varchar' })
  status: TransactionStatus;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  amountFrom: string;

  @Column({ type: 'varchar' })
  currencyFrom: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true })
  amountTo: string | null;

  @Column({ type: 'varchar', nullable: true })
  currencyTo: string | null;

  @Column({ type: 'numeric', precision: 18, scale: 6, nullable: true })
  rate: string | null;

  @Column({ type: 'varchar', nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}

