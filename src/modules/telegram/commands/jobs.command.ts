import { Injectable } from '@nestjs/common';
import { Context, Markup, Telegraf } from 'telegraf';
import { JobMessageFormatter } from '../formatters/job-message.formatter';
import { PAGE_SIZE, TelegramJobsService } from '../telegram-jobs.service';
import { UserService } from '../user.service';
import { BaseCommand } from './base.command';

@Injectable()
export class JobsCommand extends BaseCommand {
  constructor(
    private readonly userService: UserService,
    private readonly jobsService: TelegramJobsService,
    private readonly formatter: JobMessageFormatter,
  ) {
    super();
  }

  register(bot: Telegraf<Context>): void {
    bot.command('jobs', async (ctx) => {
      await this.handleJobs(ctx, 1);
    });

    bot.action(/^(jobs:page:\d+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const page = parseInt(ctx.match[1].split(':')[2], 10);
      await this.handleJobsEdit(ctx, page);
    });
  }

  private async handleJobs(ctx: Context, page: number): Promise<void> {
    const chatId = String(ctx.chat!.id);
    const user = await this.userService.findByChatId(chatId);

    if (!user) {
      await ctx.reply(
        'Send /start to register and set up your preferences first.',
      );
      return;
    }

    if (!user.stackPreferences.length && !user.locationPrefs.length) {
      await ctx.reply(
        `You haven't set any preferences yet.\n\nRun /settings to choose your tech stack and location so I can find relevant jobs.`,
      );
      return;
    }

    const { jobs, total } = await this.jobsService.findForUser(
      {
        stackPreferences: user.stackPreferences,
        locationPrefs: user.locationPrefs,
        seniorityPref: user.seniorityPref,
      },
      page,
    );

    const text = this.formatter.formatJobList(jobs, page, total);
    const keyboard = this.buildPaginationKeyboard(page, total);

    await ctx.reply(text, {
      parse_mode: 'HTML',
      ...keyboard,
      link_preview_options: { is_disabled: true },
    });
  }

  private async handleJobsEdit(ctx: Context, page: number): Promise<void> {
    const chatId = String(ctx.chat!.id);
    const user = await this.userService.findByChatId(chatId);
    if (!user) return;

    const { jobs, total } = await this.jobsService.findForUser(
      {
        stackPreferences: user.stackPreferences,
        locationPrefs: user.locationPrefs,
        seniorityPref: user.seniorityPref,
      },
      page,
    );

    const text = this.formatter.formatJobList(jobs, page, total);
    const keyboard = this.buildPaginationKeyboard(page, total);

    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...keyboard,
      link_preview_options: { is_disabled: true },
    });
  }

  private buildPaginationKeyboard(page: number, total: number) {
    const totalPages = Math.ceil(total / PAGE_SIZE);
    const buttons = [];

    if (page > 1) {
      buttons.push(
        Markup.button.callback('← Previous', `jobs:page:${page - 1}`),
      );
    }
    if (page < totalPages) {
      buttons.push(
        Markup.button.callback(`Next ${PAGE_SIZE} →`, `jobs:page:${page + 1}`),
      );
    }

    return buttons.length > 0
      ? Markup.inlineKeyboard([buttons])
      : Markup.inlineKeyboard([]);
  }
}
