import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { v4 as uuid } from 'uuid';
import { MailService } from '../mail/mail.service';

@Injectable()
export class TracingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TracingInterceptor.name);

  constructor(private readonly mailService: MailService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { traceId?: string }>();
    const response = http.getResponse<Response & { setHeader?: (k: string, v: string) => void }>();

    const existingTraceId =
      (request.headers && (request.headers['x-trace-id'] as string)) ||
      (request.headers && (request.headers['x-request-id'] as string));

    const traceId = existingTraceId || uuid();

    (request as any).traceId = traceId;
    if (typeof response?.setHeader === 'function') {
      response.setHeader('x-trace-id', traceId);
    }

    const { method, url } = request as any;
    const start = Date.now();

    this.logger.log(`[${traceId}] -> ${method} ${url}`);

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - start;
          this.logger.log(`[${traceId}] <- ${method} ${url} (${duration}ms)`);
        },
        error: (err) => {
          const duration = Date.now() - start;
          const message = `[${traceId}] !! ${method} ${url} (${duration}ms) - ${err?.message}`;
          this.logger.error(message);

          const status = (err as any)?.getStatus?.() ?? 500;
          if (status >= 500) {
            const bodyLines = [
              'Internal error detected',
              `TraceId: ${traceId}`,
              `Method: ${method}`,
              `URL: ${url}`,
              `Status: ${status}`,
              `Duration: ${duration}ms`,
              `Error: ${err?.message}`,
            ];
            void this.mailService.sendErrorAlert('Internal server error', bodyLines.join('\n'));
          }
        },
      }),
    );
  }
}

