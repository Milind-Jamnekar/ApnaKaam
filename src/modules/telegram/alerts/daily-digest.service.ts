import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { RelevanceScorerService } from '../../processing/relevance-scorer.service';
import { JobMessageFormatter } from '../formatters/job-message.formatter';
import { SubscriptionService } from '../subscription.service';
import { TelegramService } from '../telegram.service';
import { TelegramJobsService } from '../telegram-jobs.service';

export const DIGEST_QUEUE = 'telegram-digest';

@Processor(DIGEST_QUEUE)
export class DailyDigestService extends WorkerHost {
  constructor(
    @InjectPinoLogger(DailyDigestService.name)
    private readonly logger: PinoLogger,
    private readonly subscriptionService: SubscriptionService,
    private readonly jobsService: TelegramJobsService,
    private readonly formatter: JobMessageFormatter,
    private readonly telegram: TelegramService,
    private readonly scorer: RelevanceScorerService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'daily') {
      await this.sendDailyDigests();
    } else if (job.name === 'weekly') {
      await this.sendWeeklyDigests();
    }
  }

  private async sendDailyDigests(): Promise<void> {
    const subscribers =
      await this.subscriptionService.getAllActiveByFrequency('daily');
    this.logger.info(
      `Sending daily digest to ${subscribers.length} subscribers`,
    );

    for (const sub of subscribers) {
      try {
        await this.sendDigestToUser(sub, 'daily');
        await this.delay(200);
      } catch (err) {
        this.logger.error(
          {
            err: err instanceof Error ? err : new Error(String(err)),
            chatId: sub.chatId,
          },
          'Failed to send daily digest',
        );
      }
    }
  }

  private async sendWeeklyDigests(): Promise<void> {
    const subscribers =
      await this.subscriptionService.getAllActiveByFrequency('weekly');
    this.logger.info(
      `Sending weekly digest to ${subscribers.length} subscribers`,
    );

    for (const sub of subscribers) {
      try {
        await this.sendDigestToUser(sub, 'weekly');
        await this.delay(200);
      } catch (err) {
        this.logger.error(
          {
            err: err instanceof Error ? err : new Error(String(err)),
            chatId: sub.chatId,
          },
          'Failed to send weekly digest',
        );
      }
    }
  }

  private async sendDigestToUser(
    sub: {
      chatId: string;
      userId: string;
      stackPreferences: string[];
      locationPrefs: string[];
      seniorityPref: string | null;
    },
    type: 'daily' | 'weekly',
  ): Promise<void> {
    const hoursBack = type === 'daily' ? 24 : 168;
    const userPrefs = {
      stackPreferences: sub.stackPreferences,
      locationPrefs: sub.locationPrefs,
      seniorityPref: sub.seniorityPref,
    };
    const { jobs, total } = await this.jobsService.findForUser(userPrefs, 1);

    const newJobs = jobs.filter(
      (j) => this.isWithinHours(j.postedAt, hoursBack) && (j.score ?? 0) >= 40,
    );

    if (newJobs.length === 0) return;

    const date = new Date().toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Kolkata',
    });

    const label = type === 'daily' ? 'Daily' : 'Weekly';
    const header = `🔔 <b>Your ${label} Backend Jobs — ${date}</b>\n\nFound <b>${newJobs.length}</b> new jobs matching your stack:\n\n`;
    const footer =
      `\n📊 <b>Total active listings:</b> ${total} | <b>New this ${type === 'daily' ? 'day' : 'week'}:</b> ${newJobs.length}\n` +
      `Type /jobs for more or /search to filter`;

    const jobList = this.formatter.formatJobList(newJobs, 1, newJobs.length);
    const text = header + jobList + footer;

    await this.telegram.sendMessage(sub.chatId, text);

    for (const job of newJobs) {
      await this.subscriptionService.logAlert(
        sub.userId,
        job.id,
        'telegram-digest',
      );
    }
  }

  private isWithinHours(date: Date | null, hours: number): boolean {
    if (!date) return false;
    return Date.now() - date.getTime() < hours * 3600 * 1000;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
