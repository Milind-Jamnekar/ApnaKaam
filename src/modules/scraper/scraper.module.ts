import { Module } from '@nestjs/common';
import { ScraperService } from './scraper.service';
import { RemotiveScraper } from './sources/remotive.scraper';
import { WeworkremotelyScraper } from './sources/weworkremotely.scraper';

@Module({
  providers: [ScraperService, RemotiveScraper, WeworkremotelyScraper],
  exports: [ScraperService],
})
export class ScraperModule {}
