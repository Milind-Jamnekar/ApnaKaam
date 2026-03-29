import { Module } from '@nestjs/common';
import { CleanupService } from './cleanup.service';
import { DeduplicatorService } from './deduplicator.service';
import { NormalizerService } from './normalizer.service';
import { ProcessingService } from './processing.service';
import { RelevanceScorerService } from './relevance-scorer.service';
import { StackClassifierService } from './stack-classifier.service';

@Module({
  providers: [
    ProcessingService,
    NormalizerService,
    DeduplicatorService,
    StackClassifierService,
    CleanupService,
    RelevanceScorerService,
  ],
  exports: [ProcessingService, CleanupService, RelevanceScorerService],
})
export class ProcessingModule {}
