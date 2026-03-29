import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { RedisService } from '../redis/redis.service';
import { TelegramService } from '../telegram/telegram.service';

// How many consecutive zero-job runs before we alert
const FAILURE_THRESHOLD = 3;
// TTL for failure counters (7 days)
const FAILURE_TTL = 7 * 24 * 3600;

// Minimum expected jobs per run per source (0 = never alert)
const MIN_EXPECTED: Record<string, number> = {
  remotive: 5,
  weworkremotely: 1, // backend-specific feed — can legitimately be sparse
  'hn-hiring': 10,
  career_page: 1,
  wellfound: 0, // stubbed — always 0
};

@Injectable()
export class ScraperHealthService {
  constructor(
    @InjectPinoLogger(ScraperHealthService.name)
    private readonly logger: PinoLogger,
    private readonly redis: RedisService,
    private readonly telegram: TelegramService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Call after a successful scrape. Resets the consecutive-failure counter.
   * Sends an alert if the job count is unexpectedly low.
   */
  async recordSuccess(source: string, jobCount: number): Promise<void> {
    await this.redis.del(`scraper:failures:${source}`);

    const min = MIN_EXPECTED[source] ?? 1;
    if (min > 0 && jobCount < min) {
      await this.sendAlert(
        `⚠️ <b>Low job count — ${source}</b>\n\n` +
          `Returned <b>${jobCount}</b> jobs (expected ≥ ${min}). ` +
          `Selectors may be broken.`,
      );
    }
  }

  /**
   * Call after a scrape that returned 0 jobs due to an error or total failure.
   * Increments the consecutive-failure counter and alerts at threshold.
   */
  async recordFailure(source: string, err?: Error): Promise<void> {
    const key = `scraper:failures:${source}`;
    const count = await this.redis.incr(key);
    await this.redis.expire(key, FAILURE_TTL);

    this.logger.warn(
      { source, consecutiveFailures: count },
      `Scraper "${source}" failure recorded (${count} consecutive)`,
    );

    if (count >= FAILURE_THRESHOLD) {
      const errLine = err ? `\n\n<code>${this.escape(err.message)}</code>` : '';
      await this.sendAlert(
        `🚨 <b>Scraper down — ${source}</b>\n\n` +
          `Failed <b>${count}</b> times in a row.${errLine}`,
      );
    }
  }

  private async sendAlert(message: string): Promise<void> {
    const adminChatId = this.config.get<string>('ADMIN_TELEGRAM_CHAT_ID');
    if (!adminChatId) {
      this.logger.warn('ADMIN_TELEGRAM_CHAT_ID not set — skipping alert');
      return;
    }
    try {
      await this.telegram.sendMessage(adminChatId, message);
    } catch (err) {
      this.logger.error(
        { err: err instanceof Error ? err : new Error(String(err)) },
        'Failed to send admin scraper alert',
      );
    }
  }

  private escape(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
