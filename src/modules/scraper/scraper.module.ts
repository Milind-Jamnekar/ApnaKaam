import { Module } from '@nestjs/common';
import { ProcessingModule } from '../processing/processing.module';
import { ScraperService } from './scraper.service';
import { RemotiveScraper } from './sources/remotive.scraper';
import { WeworkremotelyScraper } from './sources/weworkremotely.scraper';

@Module({
  imports: [ProcessingModule],
  providers: [ScraperService, RemotiveScraper, WeworkremotelyScraper],
  exports: [ScraperService],
})
export class ScraperModule {}
