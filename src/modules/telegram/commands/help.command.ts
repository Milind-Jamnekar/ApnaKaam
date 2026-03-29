import { Injectable } from '@nestjs/common';
import { Context, Telegraf } from 'telegraf';
import { BaseCommand } from './base.command';

@Injectable()
export class HelpCommand extends BaseCommand {
  register(bot: Telegraf<Context>): void {
    bot.command('help', async (ctx) => {
      await ctx.reply(
        `<b>ApnaKaam Bot — Commands</b>\n\n` +
          `<b>Getting started</b>\n` +
          `/start — Register and set up your preferences\n` +
          `/settings — View or update your stack &amp; location\n\n` +
          `<b>Finding jobs</b>\n` +
          `/jobs — Latest jobs matching your preferences\n` +
          `/search &lt;query&gt; — Filter by keywords\n` +
          `  <i>e.g. /search senior nestjs remote</i>\n\n` +
          `<b>Alerts</b>\n` +
          `/subscribe — Set up daily, realtime, or weekly alerts\n` +
          `/unsubscribe — Stop all alerts\n\n` +
          `<b>Other</b>\n` +
          `/stats — Active listings and today's new jobs\n` +
          `/help — This message\n` +
          `/ping — Health check`,
        { parse_mode: 'HTML' },
      );
    });
  }
}
