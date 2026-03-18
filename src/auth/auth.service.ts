import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { OtpVerification } from './otp-verification.entity';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { LoginDto } from './dto/login.dto';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(OtpVerification)
    private readonly otpRepo: Repository<OtpVerification>,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async register(payload: RegisterDto) {
    const existing = await this.usersService.findByEmail(payload.email);
    if (existing) {
      throw new UnauthorizedException('Email already registered');
    }
    const passwordHash = await bcrypt.hash(payload.password, 10);
    const user = await this.usersService.createUser(payload.email, passwordHash);

    const code = this.generateOtpCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const otp = this.otpRepo.create({
      user,
      code,
      expiresAt,
      consumedAt: null,
      purpose: 'EMAIL_VERIFICATION',
    });
    await this.otpRepo.save(otp);

    this.mailService.queueOtpEmail(user.email, code);

    return { message: 'Registered successfully, please verify OTP sent to email' };
  }

  async verifyOtp(payload: VerifyOtpDto) {
    const user = await this.usersService.findByEmail(payload.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or OTP');
    }

    const otp = await this.otpRepo.findOne({
      where: { user: { id: user.id }, code: payload.otp, purpose: 'EMAIL_VERIFICATION' },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });

    if (!otp || otp.consumedAt || otp.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    otp.consumedAt = new Date();
    await this.otpRepo.save(otp);
    const verifiedUser = await this.usersService.markVerified(user.id);
    if (!verifiedUser) {
      throw new UnauthorizedException('User could not be verified');
    }

    const token = this.jwtService.sign({
      sub: verifiedUser.id,
      email: verifiedUser.email,
      role: verifiedUser.role,
    });
    // Strip sensitive fields before returning
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safeUser } = verifiedUser;
    return { token, user: safeUser };
  }

  async login(payload: LoginDto) {
    const user = await this.usersService.findByEmail(payload.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isVerified) {
      throw new UnauthorizedException('Email not verified');
    }
    const passwordOk = await bcrypt.compare(payload.password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const token = this.jwtService.sign({ sub: user.id, email: user.email, role: user.role });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safeUser } = user;
    return { token, user: safeUser };
  }

  private generateOtpCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}

