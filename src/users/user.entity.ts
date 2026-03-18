import { Column, CreateDateColumn, Entity, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Wallet } from '../wallet/wallet.entity';

export type UserRole = 'user' | 'admin';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ type: 'varchar', default: 'user' })
  role: UserRole;

  @OneToOne(() => Wallet, (wallet) => wallet.user)
  wallet: Wallet;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

