import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';

export type OtpPurpose = 'EMAIL_VERIFICATION';

@Entity()
export class OtpVerification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  user: User;

  @Column()
  code: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @Column({ type: 'varchar' })
  purpose: OtpPurpose;

  @CreateDateColumn()
  createdAt: Date;
}

