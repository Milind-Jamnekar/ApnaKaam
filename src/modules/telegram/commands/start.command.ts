import { Injectable } from '@nestjs/common';
import { Context, Telegraf } from 'telegraf';
import { PreferenceFlowService } from '../preference-flow.service';
import { SessionService } from '../session.service';
import { UserService } from '../user.service';
import { BaseCommand } from './base.command';

@Injectable()
export class StartCommand extends BaseCommand {
  constructor(
    private readonly userService: UserService,
    private readonly sessionService: SessionService,
    private readonly flowService: PreferenceFlowService,
  ) {
    super();
  }

  register(bot: Telegraf<Context>): void {
    bot.command('start', async (ctx) => {
      const chatId = String(ctx.chat.id);
      const username = ctx.from?.username;

      const { isNew } = await this.userService.upsert(chatId, username);

      if (!isNew) {
        await ctx.reply(
          `👋 Welcome back${username ? `, @${username}` : ''}!\n\n` +
            `Use /jobs to see latest matches or /settings to update your preferences.`,
        );
        return;
      }

      await ctx.reply(
        `🚀 <b>Welcome to Apna Kaam!</b>\n\n` +
          `I find backend &amp; Node.js jobs from across the internet so you don't have to check 10 platforms.\n\n` +
          `Let's set up your preferences so I can find the right jobs for you.`,
        { parse_mode: 'HTML' },
      );

      const session = this.sessionService.fresh();
      await this.sessionService.set(chatId, session);
      await this.flowService.sendStackStep(ctx);
    });
  }
}
