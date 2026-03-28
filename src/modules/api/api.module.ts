import { Module } from '@nestjs/common';
import { ScraperModule } from '../scraper/scraper.module';
import { AdminScrapeController } from './admin-scrape.controller';
import { HealthController } from './health.controller';

@Module({
  imports: [ScraperModule],
  controllers: [HealthController, AdminScrapeController],
})
export class ApiModule {}
