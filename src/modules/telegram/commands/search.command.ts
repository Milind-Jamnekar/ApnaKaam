import { Injectable } from '@nestjs/common';
import { Context, Telegraf } from 'telegraf';
import { JobMessageFormatter } from '../formatters/job-message.formatter';
import { TelegramJobsService } from '../telegram-jobs.service';
import { BaseCommand } from './base.command';

@Injectable()
export class SearchCommand extends BaseCommand {
  constructor(
    private readonly jobsService: TelegramJobsService,
    private readonly formatter: JobMessageFormatter,
  ) {
    super();
  }

  register(bot: Telegraf<Context>): void {
    bot.command('search', async (ctx) => {
      const raw = ctx.message.text.replace(/^\/search\s*/i, '').trim();

      if (!raw) {
        await ctx.reply(
          `<b>Usage:</b> /search &lt;query&gt;\n\n` +
            `Examples:\n` +
            `• /search nestjs remote\n` +
            `• /search senior nodejs mumbai\n` +
            `• /search golang`,
          { parse_mode: 'HTML' },
        );
        return;
      }

      const parsed = this.jobsService.parseSearchQuery(raw);

      if (
        !parsed.stack.length &&
        !parsed.locations.length &&
        !parsed.seniority
      ) {
        await ctx.reply(
          `Couldn't parse <b>${raw}</b> — try keywords like:\n` +
            `<code>nodejs</code>, <code>remote</code>, <code>senior</code>, <code>postgresql</code>`,
          { parse_mode: 'HTML' },
        );
        return;
      }

      const { jobs, total } = await this.jobsService.search(parsed, 1);
      const text =
        this.buildSearchHeader(parsed) +
        this.formatter.formatJobList(jobs, 1, total);

      await ctx.reply(text, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
    });
  }

  private buildSearchHeader(
    parsed: ReturnType<TelegramJobsService['parseSearchQuery']>,
  ): string {
    const parts: string[] = [];
    if (parsed.stack.length) parts.push(`🛠 ${parsed.stack.join(', ')}`);
    if (parsed.locations.length)
      parts.push(`📍 ${parsed.locations.join(', ')}`);
    if (parsed.seniority) parts.push(`🎯 ${parsed.seniority}`);

    return `<b>Search:</b> ${parts.join('  ')}\n\n`;
  }
}
