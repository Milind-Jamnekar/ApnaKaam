import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { RawJobDto } from './dto/raw-job.dto';
import { BaseScraper } from './sources/base.scraper';
import { RemotiveScraper } from './sources/remotive.scraper';
import { WeworkremotelyScraper } from './sources/weworkremotely.scraper';

@Injectable()
export class ScraperService {
  private readonly scrapers: BaseScraper[];

  constructor(
    @InjectPinoLogger(ScraperService.name)
    private readonly logger: PinoLogger,
    private readonly remotiveScraper: RemotiveScraper,
    private readonly weworkremotelyScraper: WeworkremotelyScraper,
  ) {
    this.scrapers = [remotiveScraper, weworkremotelyScraper];
  }

  async runAll(): Promise<RawJobDto[]> {
    this.logger.info(
      `Running all scrapers (${this.scrapers.length} registered)`,
    );

    const results = await Promise.allSettled(
      this.scrapers.map((scraper) => scraper.run()),
    );

    const jobs = results.flatMap((result) =>
      result.status === 'fulfilled' ? result.value : [],
    );

    this.logger.info(
      `All scrapers finished. Total jobs collected: ${jobs.length}`,
    );

    // TODO: forward to processing pipeline
    return jobs;
  }

  async runBySource(sourceName: string): Promise<RawJobDto[]> {
    const scraper = this.scrapers.find((s) => s.getSourceName() === sourceName);

    if (!scraper) {
      this.logger.warn(`No scraper registered for source: ${sourceName}`);
      return [];
    }

    const jobs = await scraper.run();
    this.logger.info(`Scraper "${sourceName}" collected ${jobs.length} jobs`);

    // TODO: forward to processing pipeline
    return jobs;
  }
}
