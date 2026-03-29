import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { LocationType } from '../../../generated/prisma-client';

const VALID_SORT_FIELDS = ['postedAt', 'relevanceScore'] as const;
type SortField = (typeof VALID_SORT_FIELDS)[number];

export class JobQueryDto {
  @IsOptional()
  @IsString()
  stack?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsEnum(LocationType)
  locationType?: LocationType;

  @IsOptional()
  @IsString()
  seniority?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minSalary?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;

  @IsOptional()
  @IsEnum(VALID_SORT_FIELDS)
  sortBy: SortField = 'postedAt';
}
