import {
  IsString, IsOptional, IsBoolean, IsInt, IsNumber,
  IsIn, IsDateString, Min, Max,
} from 'class-validator';

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
 */
export class UpdateTournamentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  venue?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  registrationDeadline?: string;

  @IsOptional()
  @IsIn(['SINGLES_MEN', 'SINGLES_WOMEN', 'DOUBLES_MEN', 'DOUBLES_WOMEN', 'MIXED_DOUBLES'])
  tournamentType?: string;

  @IsOptional()
  @IsIn(['SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION', 'ROUND_ROBIN', 'GROUP_STAGE_KNOCKOUT'])
  drawFormat?: string;

  @IsOptional()
  @IsIn(['CLAY', 'HARD_OUTDOOR', 'HARD_INDOOR', 'GRASS', 'CARPET', 'ACRYLIC', 'ARTIFICIAL_CLAY', 'ARTIFICIAL_GRASS'])
  surface?: string;

  @IsOptional()
  @IsIn(['OPEN', 'U18', 'U16', 'U14', 'SENIOR_40'])
  ageGroup?: string;

  @IsOptional()
  @IsInt()
  @IsIn([8, 16, 32, 64])
  maxParticipants?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
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
  advancePerGroup?: number;
}
