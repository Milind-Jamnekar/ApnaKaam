import { createHash } from 'crypto';
import { PinoLogger } from 'nestjs-pino';
import { RawJobDto } from '../dto/raw-job.dto';

const FETCH_TIMEOUT_MS = 30_000;
const RETRY_DELAYS_MS = [1_000, 3_000, 9_000];

export abstract class BaseScraper {
  constructor(protected readonly logger: PinoLogger) {}

  abstract getSourceName(): string;
  abstract fetchListings(): Promise<RawJobDto[]>;

  async run(): Promise<RawJobDto[]> {
    const source = this.getSourceName();

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      const start = Date.now();
      try {
        if (attempt > 0) {
          this.logger.info(
            `Scraper ${source}: attempt ${attempt + 1} of ${RETRY_DELAYS_MS.length + 1}`,
          );
        } else {
          this.logger.info(`Starting scraper: ${source}`);
        }

        const jobs = await this.fetchListings();
        const duration = Date.now() - start;
        this.logger.info(
          `Scraper ${source} finished: ${jobs.length} jobs fetched in ${duration}ms`,
        );
        return jobs;
      } catch (err) {
        const duration = Date.now() - start;
        const isLastAttempt = attempt === RETRY_DELAYS_MS.length;

        if (isLastAttempt) {
          this.logger.error(
            {
              err: err instanceof Error ? err : new Error(String(err)),
              source,
              attempts: attempt + 1,
              durationMs: duration,
            },
            `Scraper ${source} failed after ${attempt + 1} attempts — giving up`,
          );
          return [];
        }

        const delay = RETRY_DELAYS_MS[attempt];
        this.logger.warn(
          {
            source,
            attempt: attempt + 1,
            delayMs: delay,
            durationMs: duration,
          },
          `Scraper ${source} failed, retrying in ${delay}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return [];
  }

  protected async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  static generateFingerprint(
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
