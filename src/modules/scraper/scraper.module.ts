import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Module, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ProcessingModule } from '../processing/processing.module';
import { ScraperProcessor } from './scraper.processor';
import { ScraperService } from './scraper.service';
import { RemotiveScraper } from './sources/remotive.scraper';
import { WeworkremotelyScraper } from './sources/weworkremotely.scraper';

const SCRAPER_SOURCES = ['remotive', 'weworkremotely'] as const;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

@Module({
  imports: [
    ProcessingModule,
    BullModule.registerQueue({ name: 'scraper-jobs' }),
  ],
  providers: [
    ScraperService,
    ScraperProcessor,
    RemotiveScraper,
    WeworkremotelyScraper,
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

    for (const source of SCRAPER_SOURCES) {
      if (existingNames.has(source)) {
        this.logger.info(`Repeatable job already registered: ${source}`);
        continue;
      }

      await this.queue.add(source, {}, { repeat: { every: SIX_HOURS_MS } });
      this.logger.info(
        `Registered repeatable scrape job: ${source} (every 6h)`,
      );
    }
  }
}
