import {
  IsString, IsOptional, IsBoolean, IsInt, IsNumber,
  IsIn, IsDateString, IsNotEmpty, IsUUID, MaxLength, Min, Max,
  IsArray, ArrayMinSize, ArrayMaxSize, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  Trim, IsNotPastDate, IsOnOrAfterField, IsOnOrBeforeField, IsAtMostField,
} from './validators';

import { SUPPORTED_TYPES, SUPPORTED_FORMATS, SURFACES, AGE_GROUPS } from './formats';
import { CreateEventDto } from './event.dto';

export { SUPPORTED_TYPES, SUPPORTED_FORMATS, SURFACES, AGE_GROUPS };
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

  /**
   * The events to run (F-01): Men's Singles, Women's Singles, ... At least one.
   * Older clients may instead send one tournamentType + drawFormat (and the
   * size/rule fields below), which becomes a single event.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CreateEventDto)
  events?: CreateEventDto[];

  @IsOptional()
  @IsIn(SUPPORTED_TYPES, NOT_YET)
  tournamentType?: string;

  @IsOptional()
  @IsIn(SUPPORTED_FORMATS, NOT_YET)
  drawFormat?: string;

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
