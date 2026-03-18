import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST'),
      port: Number(this.configService.get<string>('SMTP_PORT') || 587),
      secure: false,
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendOtpEmail(to: string, code: string) {
    const from = this.configService.get<string>('SMTP_FROM') || 'no-reply@example.com';
    const subject = 'Your FX Trading App verification code';
    const text = `Your verification code is: ${code}`;

    try {
      await this.transporter.sendMail({ from, to, subject, text });
    } catch (err) {
      this.logger.error(`Failed to send OTP email to ${to}`, err as Error);
    }
  }

  /**
   * Schedules OTP email on the next event-loop turn so HTTP handlers can respond
   * without waiting on SMTP. Not durable across process restart (in-process only).
   */
  queueOtpEmail(to: string, code: string): void {
    setImmediate(() => {
      void this.sendOtpEmail(to, code);
    });
  }

  async sendFundingNotification(to: string, amount: number, currency: string) {
    const from = this.configService.get<string>('SMTP_FROM') || 'no-reply@example.com';
    const subject = 'Wallet funding successful';
    const text = `We have received your wallet funding of ${amount.toFixed(2)} ${currency}. The funds are now available in your FX wallet.`;

    try {
      await this.transporter.sendMail({ from, to, subject, text });
    } catch (err) {
      this.logger.error(`Failed to send funding email to ${to}`, err as Error);
    }
  }

  async sendConversionNotification(
    to: string,
    kind: 'CONVERT' | 'TRADE',
    fromCurrency: string,
    toCurrency: string,
    amountFrom: number,
    amountTo: number,
    rate: number,
  ) {
    const from = this.configService.get<string>('SMTP_FROM') || 'no-reply@example.com';
    const subject =
      kind === 'TRADE' ? 'Trade executed successfully' : 'Currency conversion successful';
    const text = [
      `We have processed your ${kind.toLowerCase()} request.`,
      '',
      `From: ${amountFrom.toFixed(2)} ${fromCurrency}`,
      `To:   ${amountTo.toFixed(2)} ${toCurrency}`,
      `Rate: ${rate.toFixed(6)}`,
    ].join('\n');

    try {
      await this.transporter.sendMail({ from, to, subject, text });
    } catch (err) {
      this.logger.error(`Failed to send ${kind.toLowerCase()} email to ${to}`, err as Error);
    }
  }

  async sendErrorAlert(subject: string, message: string) {
    const toEnv = this.configService.get<string>('ALERT_EMAIL_TO');
    if (!toEnv) {
      this.logger.warn('ALERT_EMAIL_TO not configured; skipping error alert email');
      return;
    }

    const recipients = toEnv
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);

    if (!recipients.length) {
      this.logger.warn('ALERT_EMAIL_TO is empty after parsing; skipping error alert email');
      return;
    }

    const from = this.configService.get<string>('SMTP_FROM') || 'no-reply@example.com';

    try {
      await Promise.all(
        recipients.map((to) =>
          this.transporter.sendMail({
            from,
            to,
            subject,
            text: message,
          }),
        ),
      );
    } catch (err) {
      this.logger.error(`Failed to send error alert email: ${(err as Error).message}`, err as Error);
    }
  }
}

