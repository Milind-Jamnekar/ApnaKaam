import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Context, Telegraf } from 'telegraf';
import { PreferenceFlowService } from '../preference-flow.service';
import { SessionService } from '../session.service';
import { UserService } from '../user.service';
import { BaseCommand } from './base.command';

@Injectable()
export class PreferenceFlowCommand extends BaseCommand {
  constructor(
    @InjectPinoLogger(PreferenceFlowCommand.name)
    private readonly logger: PinoLogger,
    private readonly sessionService: SessionService,
    private readonly userService: UserService,
    private readonly flowService: PreferenceFlowService,
  ) {
    super();
  }

  register(bot: Telegraf<Context>): void {
    bot.action(/^(pref:.+)$/, async (ctx) => {
      await ctx.answerCbQuery();

      const chatId = String(ctx.chat!.id);
      const action = ctx.match[1]; // full string: 'pref:stk:nodejs'
      const parts = action.split(':');
      const type = parts[1]; // stk | loc | sen | cfm
      const value = parts[2]; // nodejs | DONE | remote | junior | yes | redo

      const session = await this.sessionService.get(chatId);
      if (!session) {
        await ctx.reply(
          '⏱ Session expired. Use /start or /settings to begin again.',
        );
        return;
      }

      try {
        if (type === 'stk') {
          await this.handleStack(ctx, chatId, session, value);
        } else if (type === 'loc') {
          await this.handleLocation(ctx, chatId, session, value);
        } else if (type === 'sen') {
          await this.handleSeniority(ctx, chatId, session, value);
        } else if (type === 'cfm') {
          await this.handleConfirm(ctx, chatId, session, value);
        }
      } catch (err) {
        this.logger.error(
          { err: err instanceof Error ? err : new Error(String(err)), action },
          'Error handling preference callback',
        );
      }
    });
  }

  private async handleStack(
    ctx: Context,
    chatId: string,
    session: ReturnType<SessionService['fresh']>,
    value: string,
  ): Promise<void> {
    if (value === 'DONE') {
      session.step = 'location';
      await this.sessionService.set(chatId, session);
      await this.flowService.editToLocationStep(ctx, session.locations);
      return;
    }

    const idx = session.stack.indexOf(value);
    if (idx >= 0) session.stack.splice(idx, 1);
    else session.stack.push(value);

    await this.sessionService.set(chatId, session);
    await ctx.editMessageReplyMarkup(
      this.flowService.buildStackKeyboard(session.stack).reply_markup,
    );
  }

  private async handleLocation(
    ctx: Context,
    chatId: string,
    session: ReturnType<SessionService['fresh']>,
    value: string,
  ): Promise<void> {
    if (value === 'DONE') {
      session.step = 'seniority';
      await this.sessionService.set(chatId, session);
      await this.flowService.editToSeniorityStep(ctx);
      return;
    }

    const idx = session.locations.indexOf(value);
    if (idx >= 0) session.locations.splice(idx, 1);
    else session.locations.push(value);

    await this.sessionService.set(chatId, session);
    await ctx.editMessageReplyMarkup(
      this.flowService.buildLocationKeyboard(session.locations).reply_markup,
    );
  }

  private async handleSeniority(
    ctx: Context,
    chatId: string,
    session: ReturnType<SessionService['fresh']>,
    value: string,
  ): Promise<void> {
    session.seniority = value;
    session.step = 'confirm';
    await this.sessionService.set(chatId, session);
    await this.flowService.editToConfirmStep(ctx, session);
  }

  private async handleConfirm(
    ctx: Context,
    chatId: string,
    session: ReturnType<SessionService['fresh']>,
    value: string,
  ): Promise<void> {
    if (value === 'redo') {
      session.step = 'stack';
      session.stack = [];
      session.locations = [];
      session.seniority = '';
      await this.sessionService.set(chatId, session);
      await this.flowService.editToStackStep(ctx, []);
      return;
    }

    // Save to DB
    await this.userService.updatePreferences(chatId, {
      stackPreferences: session.stack,
      locationPrefs: session.locations,
      seniorityPref: session.seniority || undefined,
    });
    await this.sessionService.clear(chatId);

    await ctx.editMessageText(
      `🎉 <b>All set!</b>\n\n` +
        `I'll find jobs matching your stack. Here's what to do next:\n\n` +
        `👉 /jobs — see current matches\n` +
        `👉 /subscribe — set up daily alerts\n` +
        `👉 /settings — update preferences anytime`,
      { parse_mode: 'HTML' },
    );
  }
}
