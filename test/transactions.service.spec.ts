import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionsService } from '../src/transactions/transactions.service';
import { Transaction } from '../src/transactions/transaction.entity';
import { Wallet } from '../src/wallet/wallet.entity';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let txRepo: Repository<Transaction>;
  let walletRepo: Repository<Wallet>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TransactionsService,
        {
          provide: getRepositoryToken(Transaction),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(Wallet),
          useClass: Repository,
        },
      ],
    }).compile();

    service = moduleRef.get(TransactionsService);
    txRepo = moduleRef.get(getRepositoryToken(Transaction));
    walletRepo = moduleRef.get(getRepositoryToken(Wallet));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns empty when user has no wallet', async () => {
    jest.spyOn(walletRepo, 'findOne').mockResolvedValueOnce(null);

    const [items, total] = await service.listForUser(
      'user-1',
      { type: undefined, status: undefined },
      { page: 1, limit: 20 },
    );

    expect(total).toBe(0);
    expect(items).toEqual([]);
  });

  it('returns transactions for user wallet', async () => {
    const wallet = { id: 'wallet-1' } as Wallet;
    const tx1 = { id: 'tx-1' } as Transaction;
    const tx2 = { id: 'tx-2' } as Transaction;

    jest.spyOn(walletRepo, 'findOne').mockResolvedValueOnce(wallet);

    const qb: any = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValueOnce([[tx1, tx2], 2]),
    };

    jest.spyOn(txRepo, 'createQueryBuilder').mockReturnValue(qb);

    const [items, total] = await service.listForUser(
      'user-1',
      { type: undefined, status: undefined },
      { page: 1, limit: 20 },
    );

    expect(walletRepo.findOne).toHaveBeenCalledWith({ where: { user: { id: 'user-1' } } });
    expect(qb.where).toHaveBeenCalledWith('wallet.id = :walletId', { walletId: wallet.id });
    expect(total).toBe(2);
    expect(items).toEqual([tx1, tx2]);
  });
});

