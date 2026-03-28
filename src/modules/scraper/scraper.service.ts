import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  ProcessingResult,
  ProcessingService,
} from '../processing/processing.service';
import { RawJobDto } from './dto/raw-job.dto';
import { BaseScraper } from './sources/base.scraper';
import { RemotiveScraper } from './sources/remotive.scraper';
import { WeworkremotelyScraper } from './sources/weworkremotely.scraper';

export interface ScrapeAndProcessResult extends ProcessingResult {
  scraped: number;
}

@Injectable()
export class ScraperService {
  private readonly scrapers: BaseScraper[];

  constructor(
    @InjectPinoLogger(ScraperService.name)
    private readonly logger: PinoLogger,
    private readonly processingService: ProcessingService,
    private readonly remotiveScraper: RemotiveScraper,
    private readonly weworkremotelyScraper: WeworkremotelyScraper,
  ) {
    this.scrapers = [remotiveScraper, weworkremotelyScraper];
  }

  async runAll(): Promise<ScrapeAndProcessResult> {
    this.logger.info(
      `Running all scrapers (${this.scrapers.length} registered)`,
    );

    const results = await Promise.allSettled(
      this.scrapers.map((scraper) => scraper.run()),
    );

    const rawJobs = results.flatMap((r) =>
      r.status === 'fulfilled' ? r.value : [],
    );

    this.logger.info(
      `All scrapers finished. Total jobs collected: ${rawJobs.length}`,
    );

    const processingResult = await this.processingService.processJobs(rawJobs);
    return { scraped: rawJobs.length, ...processingResult };
  }

  async runBySource(sourceName: string): Promise<ScrapeAndProcessResult> {
    const scraper = this.scrapers.find((s) => s.getSourceName() === sourceName);

    if (!scraper) {
      this.logger.warn(`No scraper registered for source: ${sourceName}`);
      return { scraped: 0, saved: 0, duplicates: 0, errors: 0 };
    }

    const rawJobs = await scraper.run();
    this.logger.info(
      `Scraper "${sourceName}" collected ${rawJobs.length} jobs`,
    );

    const processingResult = await this.processingService.processJobs(rawJobs);
    return { scraped: rawJobs.length, ...processingResult };
  }

  // Exposed for cases where raw jobs are needed without processing (e.g. previews)
  async previewSource(sourceName: string): Promise<RawJobDto[]> {
    const scraper = this.scrapers.find((s) => s.getSourceName() === sourceName);
    if (!scraper) return [];
    return scraper.run();
  }
}
