import {
  IsString, IsOptional, IsBoolean, IsInt, IsNumber,
  IsIn, IsDateString, IsNotEmpty, MaxLength, Min, Max,
} from 'class-validator';
import { Trim, IsNotPastDate } from './validators';
import { SURFACES, AGE_GROUPS } from './formats';

/**
 * What an owner may change with PATCH /tournaments/:id. Deliberately has no
 * status, createdBy, clubId or id: the lifecycle moves through dedicated
 * endpoints (open, draw, ...) and ownership is never transferable this way.
 * The controller validates with forbidNonWhitelisted, so sending any of those
 * fields is a 400 rather than being silently applied.
 *
 * Format, size, seeding and rules are per event: PATCH /tournaments/:id/events/:eid.
 *
 * Rules that compare two fields (end vs start, deadline vs start)
 * are checked in TournamentsService.update against the merged result, since a
 * PATCH usually carries only one side.
 */
export class UpdateTournamentDto {
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  venue?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsDateString()
  @IsNotPastDate()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  @IsNotPastDate()
  registrationDeadline?: string;

  @IsOptional()
  @IsIn(SURFACES)
  surface?: string;

  @IsOptional()
  @IsIn(AGE_GROUPS)
  ageGroup?: string;

  @IsOptional()
  @IsIn(['CLUB', 'PUBLIC'])
  visibility?: 'CLUB' | 'PUBLIC';

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  entryFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  prizePool?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  rankingPoints?: number;

}
