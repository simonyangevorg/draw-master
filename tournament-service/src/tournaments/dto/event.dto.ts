import {
  IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min,
} from 'class-validator';
import { Trim, IsAtMostField } from './validators';
import { SUPPORTED_FORMATS } from './formats';

/**
 * Categories open today. MIXED needs doubles pairs (F-04); eligibility by
 * gender arrives with F-03 (until then a category is a label).
 */
export const SUPPORTED_CATEGORIES = ['MEN', 'WOMEN', 'OPEN'];
export const SUPPORTED_DISCIPLINES = ['SINGLES'];
const NOT_YET = { message: '$property must be one of: $constraint1 (doubles, mixed and Double Elimination are not available yet)' };

/** Fields that shape an event's draw: only changeable while the tournament is a DRAFT. */
export const EVENT_FORMAT_FIELDS = [
  'category', 'discipline', 'drawFormat', 'maxParticipants', 'minParticipants', 'seeded',
  'setsToWin', 'gamesPerSet', 'tiebreakAt', 'finalSetTiebreak', 'noAd',
  'numberOfGroups', 'advancePerGroup',
] as const;

class EventFields {
  @IsOptional()
  @IsIn(SUPPORTED_CATEGORIES, NOT_YET)
  category?: string;

  @IsOptional()
  @IsIn(SUPPORTED_DISCIPLINES, NOT_YET)
  discipline?: string;

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
  @IsInt()
  @Min(2)
  @Max(8)
  numberOfGroups?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  advancePerGroup?: number;

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
}

export class CreateEventDto extends EventFields {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @IsIn(SUPPORTED_FORMATS, NOT_YET)
  drawFormat: string;

  /** On create the minimum is checked against the maximum (default 32). */
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(64)
  @IsAtMostField('maxParticipants', 32)
  minParticipants?: number;
}

export class UpdateEventDto extends EventFields {
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsIn(SUPPORTED_FORMATS, NOT_YET)
  drawFormat?: string;
}

/** Which event a draw request or entry is for. Optional while a tournament has exactly one event. */
export class EventRefDto {
  @IsOptional()
  @IsUUID()
  eventId?: string;
}
