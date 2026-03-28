import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';

export enum LocationType {
  REMOTE = 'remote',
  HYBRID = 'hybrid',
  ONSITE = 'onsite',
}

export class RawJobDto {
  @IsString()
  title: string;

  @IsString()
  companyName: string;

  @IsString()
  description: string;

  @IsUrl()
  url: string;

  @IsString()
  source: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsEnum(LocationType)
  locationType?: LocationType;

  @IsOptional()
  @IsInt()
  @Min(0)
  salaryMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  salaryMax?: number;

  @IsOptional()
  @IsString()
  salaryCurrency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  experienceMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  experienceMax?: number;

  @IsOptional()
  @IsString()
  stackRaw?: string;

  @IsOptional()
  @IsDateString()
  postedAt?: string;

  @IsOptional()
  @IsString()
  externalId?: string;
}
