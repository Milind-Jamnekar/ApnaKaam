import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export interface PreferenceSession {
  step: 'stack' | 'location' | 'seniority' | 'confirm';
  stack: string[];
  locations: string[];
  seniority: string;
}

const SESSION_PREFIX = 'telegram:session:';
const SESSION_TTL = 600; // 10 minutes

@Injectable()
export class SessionService {
  constructor(private readonly redis: RedisService) {}

  async get(chatId: number | string): Promise<PreferenceSession | null> {
    const raw = await this.redis.get(`${SESSION_PREFIX}${chatId}`);
    return raw ? (JSON.parse(raw) as PreferenceSession) : null;
  }

  async set(
    chatId: number | string,
    session: PreferenceSession,
  ): Promise<void> {
    await this.redis.set(
      `${SESSION_PREFIX}${chatId}`,
      JSON.stringify(session),
      SESSION_TTL,
    );
  }

  async clear(chatId: number | string): Promise<void> {
    await this.redis.del(`${SESSION_PREFIX}${chatId}`);
  }

  fresh(): PreferenceSession {
    return { step: 'stack', stack: [], locations: [], seniority: '' };
  }
}
