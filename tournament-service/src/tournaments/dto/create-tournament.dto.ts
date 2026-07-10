import {
  IsString, IsOptional, IsBoolean, IsInt, IsNumber,
  IsIn, IsDateString, Min, Max,
} from 'class-validator';

export class CreateTournamentDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  clubId?: string;

  @IsOptional()
  @IsString()
  venue?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsDateString()
  registrationDeadline?: string;

  @IsIn(['SINGLES_MEN', 'SINGLES_WOMEN', 'DOUBLES_MEN', 'DOUBLES_WOMEN', 'MIXED_DOUBLES'])
  tournamentType: string;

  @IsIn(['SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION', 'ROUND_ROBIN', 'GROUP_STAGE_KNOCKOUT'])
  drawFormat: string;

  @IsIn(['CLAY', 'HARD_OUTDOOR', 'HARD_INDOOR', 'GRASS', 'CARPET', 'ACRYLIC', 'ARTIFICIAL_CLAY', 'ARTIFICIAL_GRASS'])
  surface: string;

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
  advancePerGroup?: number;
}
