import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AppService } from './app.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ApiModule } from './modules/api/api.module';
import { DatabaseModule } from './modules/database/database.module';
import { ProcessingModule } from './modules/processing/processing.module';
import { RedisModule } from './modules/redis/redis.module';
import { ScraperModule } from './modules/scraper/scraper.module';
import { TelegramModule } from './modules/telegram/telegram.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        customLogLevel: (_req, res) => {
          if (res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
        serializers: {
          req: (req: { method: string; url: string }) => ({
            method: req.method,
            url: req.url,
          }),
        },
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
      },
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),
    DatabaseModule,
    RedisModule,
    ScraperModule,
    ProcessingModule,
    TelegramModule,
    ApiModule,
  ],
  providers: [AppService, AllExceptionsFilter],
})
export class AppModule {}
