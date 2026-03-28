import { createHash } from 'crypto';
import { Logger } from 'nestjs-pino';
import { RawJobDto } from '../dto/raw-job.dto';

export abstract class BaseScraper {
  constructor(protected readonly logger: Logger) {}

  abstract getSourceName(): string;
  abstract fetchListings(): Promise<RawJobDto[]>;

  async run(): Promise<RawJobDto[]> {
    const source = this.getSourceName();
    const start = Date.now();
    this.logger.log(`Starting scraper: ${source}`);

    try {
      const jobs = await this.fetchListings();
      const duration = Date.now() - start;
      this.logger.log(
        `Scraper ${source} finished: ${jobs.length} jobs fetched in ${duration}ms`,
      );
      return jobs;
    } catch (err) {
      const duration = Date.now() - start;
      this.logger.error(
        `Scraper ${source} failed after ${duration}ms: ${(err as Error).message}`,
        (err as Error).stack,
      );
      return [];
    }
  }

  generateFingerprint(
    title: string,
    company: string,
    location: string,
  ): string {
    const normalized = [title, company, location]
      .map((s) => s.toLowerCase().trim())
      .join('|');
    return createHash('sha256').update(normalized).digest('hex');
  }
}
