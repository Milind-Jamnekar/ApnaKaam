import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';
import { PrismaService } from '../database/prisma.service';
import { ScraperService } from '../scraper/scraper.service';

interface CreateScraperConfigDto {
  companyName: string;
  sourceType: string;
  baseUrl: string;
  selectors: Record<string, unknown>;
  paginationType?: string;
  scheduleMinutes?: number;
}

interface UpdateScraperConfigDto {
  selectors?: Record<string, unknown>;
  baseUrl?: string;
  isActive?: boolean;
  scheduleMinutes?: number;
}

@Controller('api/admin/scraper-config')
export class AdminScraperConfigController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scraperService: ScraperService,
  ) {}

  @Get()
  async listConfigs() {
    return this.prisma.scraperConfig.findMany({
      include: { company: { select: { name: true } } },
      orderBy: { company: { name: 'asc' } },
    });
  }

  @Post()
  async createConfig(@Body() dto: CreateScraperConfigDto) {
    const company = await this.prisma.company.upsert({
      where: { name: dto.companyName },
      create: { name: dto.companyName },
      update: {},
    });

    return this.prisma.scraperConfig.create({
      data: {
        companyId: company.id,
        sourceType: dto.sourceType,
        baseUrl: dto.baseUrl,
        selectors: dto.selectors as Prisma.InputJsonValue,
        paginationType: dto.paginationType,
        scheduleMinutes: dto.scheduleMinutes ?? 720,
        isActive: true,
      },
      include: { company: { select: { name: true } } },
    });
  }

  @Put(':id')
  async updateConfig(
    @Param('id') id: string,
    @Body() dto: UpdateScraperConfigDto,
  ) {
    return this.prisma.scraperConfig.update({
      where: { id },
      data: {
        ...(dto.selectors !== undefined && {
          selectors: dto.selectors as Prisma.InputJsonValue,
        }),
        ...(dto.baseUrl !== undefined && { baseUrl: dto.baseUrl }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.scheduleMinutes !== undefined && {
          scheduleMinutes: dto.scheduleMinutes,
        }),
      },
      include: { company: { select: { name: true } } },
    });
  }
}
