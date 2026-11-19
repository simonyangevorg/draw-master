import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString,
  Max, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SetScoreDto {
  @IsInt()
  @Min(0)
  @Max(99)
  p1: number;

  @IsInt()
  @Min(0)
  @Max(99)
  p2: number;
}

/** Statuses an organiser may set by hand. COMPLETED comes from recording a winner. */
export const MANUAL_MATCH_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED'] as const;

export class UpdateMatchDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => SetScoreDto)
  sets?: SetScoreDto[];

  @IsOptional()
  @IsString()
  winnerId?: string;

  @IsOptional()
  @IsIn(MANUAL_MATCH_STATUSES)
  status?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
