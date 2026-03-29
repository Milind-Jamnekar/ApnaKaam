import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(AllExceptionsFilter.name)
    private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error';

    const error =
      exception instanceof HttpException
        ? (exception.constructor.name ?? 'HttpException')
        : 'InternalServerError';

    const logContext = {
      statusCode: status,
      method: request.method,
      url: request.url,
    };

    if (status >= 500) {
      this.logger.error(
        {
          ...logContext,
          err:
            exception instanceof Error
              ? exception
              : new Error(String(exception)),
        },
        message,
      );
    } else {
      this.logger.warn(logContext, message);
    }

    response.status(status).json({ statusCode: status, message, error });
  }
}
