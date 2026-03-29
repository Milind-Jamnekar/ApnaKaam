import { Injectable } from '@nestjs/common';
import { Context, Telegraf } from 'telegraf';
import { BaseCommand } from './base.command';

const HELP_TEXT =
  `📖 <b>Apna Kaam — Command Guide</b>\n\n` +
  `🔍 <b>Finding Jobs:</b>\n` +
  `/jobs — Top 10 jobs matching your stack\n` +
  `/search &lt;query&gt; — Search: <code>/search nestjs remote senior</code>\n\n` +
  `⚙️ <b>Preferences:</b>\n` +
  `/start — Set up your profile\n` +
  `/settings — Update your preferences\n` +
  `/subscribe — Set up job alerts\n` +
  `/unsubscribe — Stop all alerts\n\n` +
  `📊 <b>Info:</b>\n` +
  `/stats — Platform statistics\n` +
  `/help — This message\n\n` +
  `💡 <b>Tip:</b> I scrape new jobs every 6–12 hours from Wellfound, Remotive, ` +
  `We Work Remotely, HN, and company career pages. Subscribe to daily digest ` +
  `so you never miss a match!`;

@Injectable()
export class HelpCommand extends BaseCommand {
  register(bot: Telegraf<Context>): void {
    bot.command('help', async (ctx) => {
      await ctx.reply(HELP_TEXT, { parse_mode: 'HTML' });
    });
  }
}
