import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../src/auth/auth.service';
import { OtpVerification } from '../src/auth/otp-verification.entity';
import { UsersService } from '../src/users/users.service';
import { MailService } from '../src/mail/mail.service';
import * as bcrypt from 'bcryptjs';

jest.mock('bcryptjs');

describe('AuthService', () => {
  let service: AuthService;
  let otpRepo: Repository<OtpVerification>;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let mailService: jest.Mocked<MailService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(OtpVerification),
          useClass: Repository,
        },
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            createUser: jest.fn(),
            markVerified: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
          },
        },
        {
          provide: MailService,
          useValue: {
            sendOtpEmail: jest.fn(),
            queueOtpEmail: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    otpRepo = moduleRef.get(getRepositoryToken(OtpVerification));
    usersService = moduleRef.get(UsersService) as any;
    jwtService = moduleRef.get(JwtService) as any;
    mailService = moduleRef.get(MailService) as any;
  });

  it('register should create user, OTP and send email', async () => {
    (usersService.findByEmail as jest.Mock).mockResolvedValueOnce(null);
    (bcrypt.hash as jest.Mock).mockResolvedValueOnce('hashed');
    (usersService.createUser as jest.Mock).mockResolvedValueOnce({ id: 'u1', email: 'a@test.com' });

    const createdOtp = {};
    jest.spyOn(otpRepo, 'create').mockReturnValue(createdOtp as OtpVerification);
    jest.spyOn(otpRepo, 'save').mockResolvedValueOnce(createdOtp as OtpVerification);

    const res = await service.register({ email: 'a@test.com', password: 'secret' });

    expect(usersService.findByEmail).toHaveBeenCalledWith('a@test.com');
    expect(bcrypt.hash).toHaveBeenCalled();
    expect(usersService.createUser).toHaveBeenCalledWith('a@test.com', 'hashed');
    expect(otpRepo.create).toHaveBeenCalled();
    expect(otpRepo.save).toHaveBeenCalled();
    expect(mailService.queueOtpEmail).toHaveBeenCalledWith('a@test.com', expect.any(String));
    expect(res).toEqual({
      message: 'Registered successfully, please verify OTP sent to email',
    });
  });

  it('verifyOtp should return token and sanitized user', async () => {
    const user = {
      id: 'u1',
      email: 'a@test.com',
      role: 'user',
    } as any;

    (usersService.findByEmail as jest.Mock).mockResolvedValueOnce(user);

    const otp = {
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60000),
    } as any;
    jest.spyOn(otpRepo, 'findOne').mockResolvedValueOnce(otp);
    jest.spyOn(otpRepo, 'save').mockResolvedValueOnce(otp);

    const verifiedUser = { ...user, passwordHash: 'secret' };
    (usersService.markVerified as jest.Mock).mockResolvedValueOnce(verifiedUser);
    (jwtService.sign as jest.Mock).mockReturnValueOnce('jwt-token');

    const res = await service.verifyOtp({ email: 'a@test.com', otp: '123456' });

    expect(jwtService.sign).toHaveBeenCalledWith({
      sub: verifiedUser.id,
      email: verifiedUser.email,
      role: verifiedUser.role,
    });
    expect(res.token).toBe('jwt-token');
    expect(res.user).toEqual({
      id: verifiedUser.id,
      email: verifiedUser.email,
      role: verifiedUser.role,
    });
    expect((res.user as any).passwordHash).toBeUndefined();
  });

  it('login should reject unverified users', async () => {
    (usersService.findByEmail as jest.Mock).mockResolvedValueOnce({
      id: 'u1',
      email: 'a@test.com',
      isVerified: false,
      passwordHash: 'hash',
    } as any);

    await expect(
      service.login({ email: 'a@test.com', password: 'x' }),
    ).rejects.toThrow('Email not verified');
  });

  it('login should validate password and return sanitized user', async () => {
    const dbUser = {
      id: 'u1',
      email: 'a@test.com',
      isVerified: true,
      passwordHash: 'hash',
      role: 'user',
    } as any;
    (usersService.findByEmail as jest.Mock).mockResolvedValueOnce(dbUser);
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
    (jwtService.sign as jest.Mock).mockReturnValueOnce('jwt-token');

    const res = await service.login({ email: 'a@test.com', password: 'secret' });

    expect(bcrypt.compare).toHaveBeenCalledWith('secret', 'hash');
    expect(res.token).toBe('jwt-token');
    expect(res.user).toEqual({
      id: dbUser.id,
      email: dbUser.email,
      isVerified: true,
      role: 'user',
    });
    expect((res.user as any).passwordHash).toBeUndefined();
  });
});

