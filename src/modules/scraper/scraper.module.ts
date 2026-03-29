import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Module, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ProcessingModule } from '../processing/processing.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ScraperProcessor } from './scraper.processor';
import { ScraperService } from './scraper.service';
import { HnHiringScraper } from './sources/hn-hiring.scraper';
import { RemotiveScraper } from './sources/remotive.scraper';
import { WellfoundScraper } from './sources/wellfound.scraper';
import { WeworkremotelyScraper } from './sources/weworkremotely.scraper';

// Sources that run every 6 hours (lightweight API/RSS scrapers)
const FAST_SOURCES = ['remotive', 'weworkremotely'] as const;
// Sources that run every 12 hours (Playwright-based, heavier)
const SLOW_SOURCES = ['wellfound'] as const;
// Sources that run once daily
const DAILY_SOURCES = ['hn-hiring'] as const;

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CLEANUP_JOB = 'cleanup';

@Module({
  imports: [
    ProcessingModule,
    TelegramModule,
    BullModule.registerQueue({ name: 'scraper-jobs' }),
  ],
  providers: [
    ScraperService,
    ScraperProcessor,
    RemotiveScraper,
    WeworkremotelyScraper,
    WellfoundScraper,
    HnHiringScraper,
  ],
  exports: [ScraperService],
})
export class ScraperModule implements OnModuleInit {
  constructor(
    @InjectQueue('scraper-jobs') private readonly queue: Queue,
    @InjectPinoLogger(ScraperModule.name) private readonly logger: PinoLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    const existing = await this.queue.getJobSchedulers();
    const existingNames = new Set(existing.map((j) => j.name));

    for (const source of FAST_SOURCES) {
      if (existingNames.has(source)) {
        this.logger.info(`Repeatable job already registered: ${source}`);
        continue;
      }
      await this.queue.add(source, {}, { repeat: { every: SIX_HOURS_MS } });
      this.logger.info(
        `Registered repeatable scrape job: ${source} (every 6h)`,
      );
    }

    for (const source of SLOW_SOURCES) {
      if (existingNames.has(source)) {
        this.logger.info(`Repeatable job already registered: ${source}`);
        continue;
      }
      await this.queue.add(source, {}, { repeat: { every: TWELVE_HOURS_MS } });
      this.logger.info(
        `Registered repeatable scrape job: ${source} (every 12h)`,
      );
    }

    for (const source of DAILY_SOURCES) {
      if (existingNames.has(source)) {
        this.logger.info(`Repeatable job already registered: ${source}`);
        continue;
      }
      await this.queue.add(source, {}, { repeat: { every: ONE_DAY_MS } });
      this.logger.info(
        `Registered repeatable scrape job: ${source} (every 24h)`,
      );
    }

    if (!existingNames.has(CLEANUP_JOB)) {
      await this.queue.add(CLEANUP_JOB, {}, { repeat: { every: ONE_DAY_MS } });
      this.logger.info('Registered repeatable cleanup job (every 24h)');
    } else {
      this.logger.info('Repeatable job already registered: cleanup');
    }
  }
}
