import { Injectable } from '@nestjs/common';
import { Context, Markup } from 'telegraf';
import { PreferenceSession } from './session.service';

export const STACK_OPTIONS = [
  'nodejs', 'nestjs', 'typescript', 'express',
  'postgresql', 'redis', 'mongodb', 'docker',
  'kubernetes', 'aws', 'golang', 'python',
  'graphql', 'microservices',
];

export const LOCATION_OPTIONS = [
  { label: '🌍 Remote', value: 'remote' },
  { label: '🇮🇳 Mumbai', value: 'mumbai' },
  { label: '🇮🇳 Bangalore', value: 'bangalore' },
  { label: '🇮🇳 India (Any)', value: 'india' },
  { label: '🇺🇸 USA', value: 'usa' },
  { label: '🇪🇺 Europe', value: 'europe' },
  { label: '🌏 Anywhere', value: 'anywhere' },
];

export const SENIORITY_OPTIONS = [
  { label: 'Junior (0–2 yrs)', value: 'junior' },
  { label: 'Mid (2–5 yrs)', value: 'mid' },
  { label: 'Senior (5+ yrs)', value: 'senior' },
  { label: 'Lead / Staff', value: 'lead' },
  { label: 'Any level', value: 'any' },
];

@Injectable()
export class PreferenceFlowService {
  // ─── Step messages ────────────────────────────────────────────────────────

  stackMessage(): string {
    return (
      `🛠 <b>Step 1/3 — Tech Stack</b>\n\n` +
      `Select the technologies you work with.\n` +
      `Tap to toggle, then tap <b>Done</b> when finished.`
    );
  }

  locationMessage(): string {
    return (
      `📍 <b>Step 2/3 — Location</b>\n\n` +
      `Where do you prefer to work?\n` +
      `You can select multiple.`
    );
  }

  seniorityMessage(): string {
    return `🎯 <b>Step 3/3 — Seniority Level</b>\n\nWhat's your current level?`;
  }

  confirmMessage(session: PreferenceSession): string {
    const stack = session.stack.length
      ? session.stack.join(', ')
      : '<i>none selected</i>';
    const locations = session.locations.length
      ? session.locations.join(', ')
      : '<i>none selected</i>';
    const seniority = session.seniority || '<i>not set</i>';

    return (
      `✅ <b>Almost done! Here's your profile:</b>\n\n` +
      `🛠 <b>Stack:</b> ${stack}\n` +
      `📍 <b>Location:</b> ${locations}\n` +
      `🎯 <b>Seniority:</b> ${seniority}\n\n` +
      `Confirm to save, or start over.`
    );
  }

  // ─── Keyboard builders ────────────────────────────────────────────────────

  buildStackKeyboard(selected: string[]) {
    const buttons = STACK_OPTIONS.map((opt) =>
      Markup.button.callback(
        selected.includes(opt) ? `✅ ${opt}` : opt,
        `pref:stk:${opt}`,
      ),
    );

    const rows: ReturnType<typeof Markup.button.callback>[][] = [];
    for (let i = 0; i < buttons.length; i += 3) {
      rows.push(buttons.slice(i, i + 3));
    }

    const doneLabel =
      selected.length > 0 ? `Done ✅  (${selected.length} selected)` : `Skip →`;
    rows.push([Markup.button.callback(doneLabel, 'pref:stk:DONE')]);

    return Markup.inlineKeyboard(rows);
  }

  buildLocationKeyboard(selected: string[]) {
    const rows = LOCATION_OPTIONS.map((opt) => [
      Markup.button.callback(
        selected.includes(opt.value) ? `✅ ${opt.label}` : opt.label,
        `pref:loc:${opt.value}`,
      ),
    ]);

    const doneLabel =
      selected.length > 0 ? `Done ✅  (${selected.length} selected)` : `Skip →`;
    rows.push([Markup.button.callback(doneLabel, 'pref:loc:DONE')]);

    return Markup.inlineKeyboard(rows);
  }

  buildSeniorityKeyboard() {
    const rows = SENIORITY_OPTIONS.map((opt) => [
      Markup.button.callback(opt.label, `pref:sen:${opt.value}`),
    ]);
    return Markup.inlineKeyboard(rows);
  }

  buildConfirmKeyboard() {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('Save ✅', 'pref:cfm:yes'),
        Markup.button.callback('Start Over 🔄', 'pref:cfm:redo'),
      ],
    ]);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  async sendStackStep(ctx: Context): Promise<void> {
    await ctx.reply(this.stackMessage(), {
      parse_mode: 'HTML',
      ...this.buildStackKeyboard([]),
    });
  }

  async editToStackStep(ctx: Context, selected: string[]): Promise<void> {
    await ctx.editMessageText(this.stackMessage(), {
      parse_mode: 'HTML',
      ...this.buildStackKeyboard(selected),
    });
  }

  async editToLocationStep(ctx: Context, selected: string[]): Promise<void> {
    await ctx.editMessageText(this.locationMessage(), {
      parse_mode: 'HTML',
      ...this.buildLocationKeyboard(selected),
    });
  }

  async editToSeniorityStep(ctx: Context): Promise<void> {
    await ctx.editMessageText(this.seniorityMessage(), {
      parse_mode: 'HTML',
      ...this.buildSeniorityKeyboard(),
    });
  }

  async editToConfirmStep(ctx: Context, session: PreferenceSession): Promise<void> {
    await ctx.editMessageText(this.confirmMessage(session), {
      parse_mode: 'HTML',
      ...this.buildConfirmKeyboard(),
    });
  }
}
