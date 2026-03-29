import { Module } from '@nestjs/common';
import { BaseCommand } from './commands/base.command';
import { PingCommand } from './commands/ping.command';
import { PreferenceFlowCommand } from './commands/preference-flow.command';
import { SettingsCommand } from './commands/settings.command';
import { StartCommand } from './commands/start.command';
import { PreferenceFlowService } from './preference-flow.service';
import { SessionService } from './session.service';
import { TELEGRAM_COMMANDS } from './telegram.constants';
import { TelegramService } from './telegram.service';
import { UserService } from './user.service';

const commandProviders = [
  PingCommand,
  StartCommand,
  SettingsCommand,
  PreferenceFlowCommand,
];

@Module({
  providers: [
    UserService,
    SessionService,
    PreferenceFlowService,
    ...commandProviders,
    {
      provide: TELEGRAM_COMMANDS,
      useFactory: (...cmds: BaseCommand[]) => cmds,
      inject: commandProviders,
    },
    TelegramService,
  ],
  exports: [TelegramService],
})
export class TelegramModule {}
