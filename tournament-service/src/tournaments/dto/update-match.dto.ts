import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString,
  Max, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SetScoreDto {
  /** The loser's points in a set tiebreak, for 7-6(5) (F-06). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  tb?: number;

  /** Set by the server; accepted and ignored from clients. */
  @IsOptional()
  @IsBoolean()
  isMatchTiebreak?: boolean;

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
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => SetScoreDto)
  sets?: SetScoreDto[];

  @IsOptional()
  @IsString()
  winnerId?: string;

  /** COMPLETED (default), RETIRED, WALKOVER or DEFAULT (F-06). */
  @IsOptional()
  @IsIn(['COMPLETED', 'RETIRED', 'WALKOVER', 'DEFAULT'])
  outcome?: string;

  @IsOptional()
  @IsIn(MANUAL_MATCH_STATUSES)
  status?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
