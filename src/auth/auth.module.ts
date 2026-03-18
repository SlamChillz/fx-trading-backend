import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { OtpVerification } from './otp-verification.entity';
import { User } from '../users/user.entity';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './jwt.strategy';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    MailModule,
    TypeOrmModule.forFeature([User, OtpVerification]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'dev_jwt_secret',
        signOptions: { expiresIn: '1d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}

