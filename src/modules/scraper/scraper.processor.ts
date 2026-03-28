import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ScraperService } from './scraper.service';

@Processor('scraper-jobs')
export class ScraperProcessor extends WorkerHost {
  constructor(
    @InjectPinoLogger(ScraperProcessor.name)
    private readonly logger: PinoLogger,
    private readonly scraperService: ScraperService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const source = job.name;
    const start = Date.now();

    this.logger.info(`Processing scheduled scrape job: ${source}`);

    const result = await this.scraperService.runBySource(source);
    const duration = Date.now() - start;

    this.logger.info(
      {
        source,
        scraped: result.scraped,
        saved: result.saved,
        duplicates: result.duplicates,
        errors: result.errors,
        durationMs: duration,
      },
      `Scrape job complete: ${source}`,
    );
  }
}
