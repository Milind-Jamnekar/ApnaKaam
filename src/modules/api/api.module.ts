import { Module } from '@nestjs/common';
import { ScraperModule } from '../scraper/scraper.module';
import { AdminScrapeController } from './admin-scrape.controller';
import { AdminScraperConfigController } from './admin-scraper-config.controller';
import { HealthController } from './health.controller';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [ScraperModule],
  controllers: [
    HealthController,
    AdminScrapeController,
    AdminScraperConfigController,
    JobsController,
  ],
  providers: [JobsService],
})
export class ApiModule {}
