import { Injectable } from '@nestjs/common';
import { User } from '../../generated/prisma-client';
import { PrismaService } from '../database/prisma.service';

export interface UserPreferences {
  stackPreferences: string[];
  locationPrefs: string[];
  seniorityPref: string;
}

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async findByChatId(chatId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { telegramChatId: chatId } });
  }

  async upsert(
    chatId: string,
    username?: string,
  ): Promise<{ user: User; isNew: boolean }> {
    const existing = await this.findByChatId(chatId);
    if (existing) return { user: existing, isNew: false };

    const user = await this.prisma.user.create({
      data: { telegramChatId: chatId, telegramUsername: username },
    });
    return { user, isNew: true };
  }

  async updatePreferences(
    chatId: string,
    prefs: Partial<UserPreferences>,
  ): Promise<User> {
    return this.prisma.user.update({
      where: { telegramChatId: chatId },
      data: {
        ...(prefs.stackPreferences !== undefined && {
          stackPreferences: prefs.stackPreferences,
        }),
        ...(prefs.locationPrefs !== undefined && {
          locationPrefs: prefs.locationPrefs,
        }),
        ...(prefs.seniorityPref !== undefined && {
          seniorityPref: prefs.seniorityPref,
        }),
      },
    });
  }
}
