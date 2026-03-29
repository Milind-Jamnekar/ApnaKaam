import { Injectable } from '@nestjs/common';
import { Context, Markup, Telegraf } from 'telegraf';
import { PreferenceFlowService } from '../preference-flow.service';
import { SessionService } from '../session.service';
import { UserService } from '../user.service';
import { BaseCommand } from './base.command';

@Injectable()
export class SettingsCommand extends BaseCommand {
  constructor(
    private readonly userService: UserService,
    private readonly sessionService: SessionService,
    private readonly flowService: PreferenceFlowService,
  ) {
    super();
  }

  register(bot: Telegraf<Context>): void {
    bot.command('settings', async (ctx) => {
      const chatId = String(ctx.chat.id);
      const user = await this.userService.findByChatId(chatId);

      if (!user) {
        await ctx.reply(
          "You're not registered yet. Send /start to set up your profile.",
        );
        return;
      }

      const stack = user.stackPreferences.length
        ? user.stackPreferences.join(', ')
        : '<i>not set</i>';
      const locations = user.locationPrefs.length
        ? user.locationPrefs.join(', ')
        : '<i>not set</i>';
      const seniority = user.seniorityPref ?? '<i>not set</i>';

      await ctx.reply(
        `⚙️ <b>Your Current Preferences</b>\n\n` +
          `🛠 <b>Stack:</b> ${stack}\n` +
          `📍 <b>Location:</b> ${locations}\n` +
          `🎯 <b>Seniority:</b> ${seniority}`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                'Update Preferences ✏️',
                'settings:update',
              ),
            ],
          ]),
        },
      );
    });

    bot.action('settings:update', async (ctx) => {
      await ctx.answerCbQuery();
      const chatId = String(ctx.chat!.id);
      const session = this.sessionService.fresh();
      await this.sessionService.set(chatId, session);
      await this.flowService.editToStackStep(ctx, []);
    });
  }
}
