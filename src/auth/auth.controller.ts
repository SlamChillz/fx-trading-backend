import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { LoginDto } from './dto/login.dto';
import { ApiBody, ApiTags } from '@nestjs/swagger';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiBody({
    type: RegisterDto,
    examples: {
      default: {
        summary: 'Register user',
        value: {
          email: 'user@example.com',
          password: 'StrongP@ssw0rd',
        },
      },
    },
  })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('verify')
  @ApiBody({
    type: VerifyOtpDto,
    examples: {
      default: {
        summary: 'Verify email with OTP',
        value: {
          email: 'user@example.com',
          otp: '123456',
        },
      },
    },
  })
  verify(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Post('login')
  @ApiBody({
    type: LoginDto,
    examples: {
      default: {
        summary: 'Login user',
        value: {
          email: 'user@example.com',
          password: 'StrongP@ssw0rd',
        },
      },
    },
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}

