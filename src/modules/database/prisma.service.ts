import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../../../generated/prisma/client';

// PrismaClient is exported as a const (class factory) in Prisma v7,
// so we cast to allow class extension while preserving full type inference.
const PrismaBase = PrismaClient as unknown as new () => PrismaClient;

@Injectable()
export class PrismaService
  extends PrismaBase
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
