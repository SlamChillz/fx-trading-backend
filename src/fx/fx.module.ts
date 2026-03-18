import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { FxService } from './fx.service';
import { FxController } from './fx.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FxRateSnapshot } from './fx-rate-snapshot.entity';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [ConfigModule, HttpModule, TypeOrmModule.forFeature([FxRateSnapshot]), MailModule],
  controllers: [FxController],
  providers: [FxService],
  exports: [FxService],
})
export class FxModule {}

