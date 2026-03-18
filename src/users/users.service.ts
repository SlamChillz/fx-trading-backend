import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  findByEmail(email: string) {
    return this.usersRepo.findOne({ where: { email } });
  }

  findById(id: string) {
    return this.usersRepo.findOne({ where: { id } });
  }

  async createUser(email: string, passwordHash: string, role: UserRole = 'user') {
    const user = this.usersRepo.create({
      email,
      passwordHash,
      role,
      isVerified: false,
    });
    return this.usersRepo.save(user);
  }

  async markVerified(userId: string) {
    await this.usersRepo.update(userId, { isVerified: true });
    return this.findById(userId);
  }
}

