import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AppService } from './app.service';
import { DatabaseModule } from './modules/database/database.module';
import { ScraperModule } from './modules/scraper/scraper.module';
import { ProcessingModule } from './modules/processing/processing.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { ApiModule } from './modules/api/api.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
      },
    }),
    DatabaseModule,
    ScraperModule,
    ProcessingModule,
    TelegramModule,
    ApiModule,
  ],
  providers: [AppService],
})
export class AppModule {}
