import {
  IsString, IsOptional, IsBoolean, IsInt, IsNumber,
  IsIn, IsDateString, IsNotEmpty, IsUUID, MaxLength, Min, Max,
} from 'class-validator';
import {
  Trim, IsNotPastDate, IsOnOrAfterField, IsOnOrBeforeField, IsAtMostField,
} from './validators';

/**
 * What can be created today. Double Elimination and doubles/mixed exist in the
 * entity but aren't implemented (F-10, F-04); until they are, the API refuses
 * them rather than silently building a singles Single Elimination draw (B-17).
 */
export const SUPPORTED_TYPES = ['SINGLES_MEN', 'SINGLES_WOMEN'];
export const SUPPORTED_FORMATS = ['SINGLE_ELIMINATION', 'ROUND_ROBIN', 'GROUP_STAGE_KNOCKOUT'];
export const SURFACES = ['CLAY', 'HARD_OUTDOOR', 'HARD_INDOOR', 'GRASS', 'CARPET', 'ACRYLIC', 'ARTIFICIAL_CLAY', 'ARTIFICIAL_GRASS'];
export const AGE_GROUPS = ['OPEN', 'U18', 'U16', 'U14', 'SENIOR_40'];
const NOT_YET = { message: '$property must be one of: $constraint1 (doubles and Double Elimination are not available yet)' };

export class CreateTournamentDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Required: the club this tournament belongs to (the caller must be its admin). */
  @IsUUID()
  clubId: string;

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

  @IsDateString()
  @IsNotPastDate()
  startDate: string;

  @IsDateString()
  @IsOnOrAfterField('startDate')
  endDate: string;

  @IsOptional()
  @IsDateString()
  @IsNotPastDate()
  @IsOnOrBeforeField('startDate')
  registrationDeadline?: string;

  @IsIn(SUPPORTED_TYPES, NOT_YET)
  tournamentType: string;

  @IsIn(SUPPORTED_FORMATS, NOT_YET)
  drawFormat: string;

  @IsIn(SURFACES)
  surface: string;

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
  @IsAtMostField('maxParticipants', 32)
  minParticipants?: number;

  @IsOptional()
  @IsBoolean()
  seeded?: boolean;

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

  // Match format
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

  // Group stage
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
