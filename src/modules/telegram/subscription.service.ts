import { Injectable } from '@nestjs/common';
import { Subscription } from '../../generated/prisma-client';
import { PrismaService } from '../database/prisma.service';

export type SubscriptionFrequency = 'daily' | 'realtime' | 'weekly';

@Injectable()
export class SubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

  async getActive(chatId: string): Promise<Subscription | null> {
    const user = await this.prisma.user.findUnique({
      where: { telegramChatId: chatId },
      include: { subscriptions: { where: { isActive: true }, take: 1 } },
    });
    return user?.subscriptions[0] ?? null;
  }

  async subscribe(
    chatId: string,
    frequency: SubscriptionFrequency,
  ): Promise<Subscription> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { telegramChatId: chatId },
    });

    // Deactivate existing subscriptions first
    await this.prisma.subscription.updateMany({
      where: { userId: user.id, isActive: true },
      data: { isActive: false },
    });

    return this.prisma.subscription.create({
      data: {
        userId: user.id,
        frequency,
        timeOfDay: '09:00',
        timezone: 'Asia/Kolkata',
        isActive: true,
      },
    });
  }

  async unsubscribe(chatId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { telegramChatId: chatId },
    });
    if (!user) return false;

    const result = await this.prisma.subscription.updateMany({
      where: { userId: user.id, isActive: true },
      data: { isActive: false },
    });

    return result.count > 0;
  }

  async getAllActiveByFrequency(frequency: SubscriptionFrequency): Promise<
    Array<{
      chatId: string;
      userId: string;
      stackPreferences: string[];
      locationPrefs: string[];
    }>
  > {
    const subs = await this.prisma.subscription.findMany({
      where: { frequency, isActive: true },
      include: {
        user: {
          select: {
            id: true,
            telegramChatId: true,
            stackPreferences: true,
            locationPrefs: true,
            isActive: true,
          },
        },
      },
    });

    return subs
      .filter((s) => s.user.isActive)
      .map((s) => ({
        chatId: s.user.telegramChatId,
        userId: s.user.id,
        stackPreferences: s.user.stackPreferences,
        locationPrefs: s.user.locationPrefs,
      }));
  }

  async hasAlertBeenSent(userId: string, jobId: string): Promise<boolean> {
    const log = await this.prisma.alertLog.findFirst({
      where: { userId, jobId },
    });
    return !!log;
  }

  async logAlert(
    userId: string,
    jobId: string,
    channel: string,
  ): Promise<void> {
    await this.prisma.alertLog.create({
      data: { userId, jobId, channel },
    });
  }
}
