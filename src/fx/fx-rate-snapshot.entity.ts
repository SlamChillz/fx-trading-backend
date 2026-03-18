import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class FxRateSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  baseCurrency: string;

  @Column({ type: 'jsonb' })
  rates: Record<string, number>;

  @Column({ type: 'varchar' })
  source: string;

  @CreateDateColumn()
  fetchedAt: Date;
}

