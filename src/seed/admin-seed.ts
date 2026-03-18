import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../users/user.entity';
import { Wallet } from '../wallet/wallet.entity';
import { WalletBalance } from '../wallet/wallet-balance.entity';
import { Transaction } from '../transactions/transaction.entity';

const logger = new Logger('AdminSeed');

const requiredEnvKeys = [
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
] as const;

function getRequiredEnv(): Record<(typeof requiredEnvKeys)[number], string> | null {
  const missing = requiredEnvKeys.filter((key) => !process.env[key]);
  if (missing.length) {
    logger.error(`Missing required env: ${missing.join(', ')}`);
    return null;
  }
  return process.env as Record<(typeof requiredEnvKeys)[number], string>;
}

export async function runAdminSeed(from: 'startup' | 'cli' = 'cli') {
  const env = getRequiredEnv();
  if (!env) {
    if (from === 'cli') process.exit(1);
    return;
  }

  const { ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = env;

  const dataSource = new DataSource({
    type: 'postgres',
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    entities: [User, Wallet, WalletBalance, Transaction],
    synchronize: false,
  });

  try {
    await dataSource.initialize();
  } catch (err) {
    logger.error(`Failed to connect to database for admin seed: ${(err as Error).message}`);
    if (from === 'cli') process.exit(1);
    return;
  }

  const userRepo = dataSource.getRepository(User);

  try {
    const existing = await userRepo.findOne({ where: { email } });
    const passwordHash = await bcrypt.hash(password, 10);

    if (existing) {
      existing.role = 'admin';
      existing.passwordHash = passwordHash;
      existing.isVerified = true;
      await userRepo.save(existing);
      logger.log(`Admin updated: ${email}`);
    } else {
      await userRepo.save(
        userRepo.create({
          email,
          passwordHash,
          role: 'admin',
          isVerified: true,
        }),
      );
      logger.log(`Admin created: ${email}`);
    }
  } catch (err) {
    logger.error(`Admin seed failed: ${(err as Error).message}`);
    if (from === 'cli') process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

