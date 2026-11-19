import {
  IsString, IsOptional, IsBoolean, IsInt, IsNumber,
  IsIn, IsDateString, IsNotEmpty, MaxLength, Min, Max,
} from 'class-validator';
import { Trim, IsNotPastDate } from './validators';
import { SUPPORTED_TYPES, SUPPORTED_FORMATS, SURFACES, AGE_GROUPS } from './create-tournament.dto';

/** Fields that shape the draw; only changeable while the tournament is a DRAFT. */
export const FORMAT_FIELDS = [
  'tournamentType', 'drawFormat', 'maxParticipants', 'minParticipants', 'seeded',
  'setsToWin', 'gamesPerSet', 'tiebreakAt', 'finalSetTiebreak', 'noAd',
  'numberOfGroups', 'advancePerGroup',
] as const;

/**
 * What an owner may change with PATCH /tournaments/:id. Deliberately has no
 * status, organiserId, clubId or id: the lifecycle moves through dedicated
 * endpoints (open, draw, ...) and ownership is never transferable this way.
 * The controller validates with forbidNonWhitelisted, so sending any of those
 * fields is a 400 rather than being silently applied.
 *
 * Rules that compare two fields (end vs start, deadline vs start, min vs max)
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
  @IsIn(SUPPORTED_TYPES)
  tournamentType?: string;

  @IsOptional()
  @IsIn(SUPPORTED_FORMATS)
  drawFormat?: string;

  @IsOptional()
  @IsIn(SURFACES)
  surface?: string;

  @IsOptional()
  @IsIn(AGE_GROUPS)
  ageGroup?: string;

  @IsOptional()
  @IsInt()
  @IsIn([8, 16, 32, 64])
  maxParticipants?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(64)
  minParticipants?: number;

  @IsOptional()
  @IsBoolean()
  seeded?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

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

  @IsOptional()
  @IsInt()
  @IsIn([1, 2, 3])
  setsToWin?: number;

  @IsOptional()
  @IsInt()
  @IsIn([4, 6])
  gamesPerSet?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(12)
  tiebreakAt?: number;

  @IsOptional()
  @IsBoolean()
  finalSetTiebreak?: boolean;

  @IsOptional()
  @IsBoolean()
  noAd?: boolean;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(8)
  numberOfGroups?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  advancePerGroup?: number;
}
