import { Injectable } from '@nestjs/common';
import { Context, Markup, Telegraf } from 'telegraf';
import {
  SubscriptionFrequency,
  SubscriptionService,
} from '../subscription.service';
import { UserService } from '../user.service';
import { BaseCommand } from './base.command';

const FREQUENCY_LABELS: Record<SubscriptionFrequency, string> = {
  daily: 'daily digest at 9:00 AM IST',
  realtime: 'realtime alerts',
  weekly: 'weekly summary every Monday',
};

@Injectable()
export class SubscribeCommand extends BaseCommand {
  constructor(
    private readonly userService: UserService,
    private readonly subscriptionService: SubscriptionService,
  ) {
    super();
  }

  register(bot: Telegraf<Context>): void {
    bot.command('subscribe', async (ctx) => {
      const chatId = String(ctx.chat.id);
      const user = await this.userService.findByChatId(chatId);

      if (!user) {
        await ctx.reply('Send /start to register first.');
        return;
      }

      // Accept text-based: /subscribe daily | /subscribe realtime | /subscribe weekly
      const arg = ctx.message.text.split(/\s+/)[1]?.toLowerCase();
      if (arg && ['daily', 'realtime', 'weekly'].includes(arg)) {
        await this.doSubscribe(ctx, chatId, arg as SubscriptionFrequency);
        return;
      }

      const current = await this.subscriptionService.getActive(chatId);
      const statusLine = current
        ? `\nCurrently: <b>${FREQUENCY_LABELS[current.frequency as SubscriptionFrequency]}</b>\n`
        : '\nCurrently: <b>not subscribed</b>\n';

      await ctx.reply(
        `🔔 <b>Job Alerts</b>${statusLine}\nChoose your notification preference:`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📬 Daily Digest (9 AM)', 'sub:daily')],
            [Markup.button.callback('⚡ Realtime', 'sub:realtime')],
            [
              Markup.button.callback(
                '📅 Weekly Summary (Monday)',
                'sub:weekly',
              ),
            ],
            [Markup.button.callback('🔕 Unsubscribe', 'sub:off')],
          ]),
        },
      );
    });

    bot.command('unsubscribe', async (ctx) => {
      const chatId = String(ctx.chat.id);
      const removed = await this.subscriptionService.unsubscribe(chatId);
      if (removed) {
        await ctx.reply(
          "🔕 You've been unsubscribed. You won't receive any more job alerts.\n\nRun /subscribe to re-enable alerts anytime.",
        );
      } else {
        await ctx.reply("You don't have an active subscription.");
      }
    });

    bot.action(/^(sub:(daily|realtime|weekly|off))$/, async (ctx) => {
      await ctx.answerCbQuery();
      const chatId = String(ctx.chat!.id);
      const action = ctx.match[1]; // e.g. 'sub:daily'
      const value = action.split(':')[1] as SubscriptionFrequency | 'off';

      if (value === 'off') {
        const removed = await this.subscriptionService.unsubscribe(chatId);
        await ctx.editMessageText(
          removed
            ? "🔕 Unsubscribed. You won't receive any more job alerts.\n\nRun /subscribe to re-enable anytime."
            : "You don't have an active subscription.",
          { parse_mode: 'HTML' },
        );
        return;
      }

      // Skip if already on the same frequency
      const current = await this.subscriptionService.getActive(chatId);
      if (current?.frequency === value) {
        await ctx.editMessageText(
          `You're already subscribed to <b>${FREQUENCY_LABELS[value]}</b>. No changes made.\n\nRun /settings to update your job preferences.`,
          { parse_mode: 'HTML' },
        );
        return;
      }

      await this.doSubscribeEdit(ctx, chatId, value);
    });
  }

  private async doSubscribe(
    ctx: Context,
    chatId: string,
    frequency: SubscriptionFrequency,
  ): Promise<void> {
    const current = await this.subscriptionService.getActive(chatId);
    if (current?.frequency === frequency) {
      await ctx.reply(
        `You're already subscribed to <b>${FREQUENCY_LABELS[frequency]}</b>. No changes made.\n\nRun /settings to update your job preferences.`,
        { parse_mode: 'HTML' },
      );
      return;
    }
    await this.subscriptionService.subscribe(chatId, frequency);
    await ctx.reply(this.confirmationText(frequency), { parse_mode: 'HTML' });
  }

  private async doSubscribeEdit(
    ctx: Context,
    chatId: string,
    frequency: SubscriptionFrequency,
  ): Promise<void> {
    await this.subscriptionService.subscribe(chatId, frequency);
    await ctx.editMessageText(this.confirmationText(frequency), {
      parse_mode: 'HTML',
    });
  }

  private confirmationText(frequency: SubscriptionFrequency): string {
    const messages: Record<SubscriptionFrequency, string> = {
      daily:
        "✅ <b>Subscribed to Daily Digest</b>\n\nYou'll get a morning roundup at <b>9:00 AM IST</b> with new jobs matching your stack.\n\nRun /settings to update your preferences.",
      realtime:
        "✅ <b>Subscribed to Realtime Alerts</b>\n\nYou'll be notified as soon as new matching jobs are found.\n\nRun /settings to update your preferences.",
      weekly:
        "✅ <b>Subscribed to Weekly Summary</b>\n\nYou'll get a weekly roundup every <b>Monday morning</b> with the best new jobs.\n\nRun /settings to update your preferences.",
    };
    return messages[frequency];
  }
}
