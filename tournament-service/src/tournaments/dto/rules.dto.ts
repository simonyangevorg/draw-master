import {
  IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Trim } from './validators';

/** One stage's rules (F-05). tiebreakAt defaults to gamesPerSet. */
export class RuleSetDto {
  @IsInt()
  @IsIn([1, 3, 5])
  bestOf: 1 | 3 | 5;

  @IsInt()
  @IsIn([4, 6, 8])
  gamesPerSet: 4 | 6 | 8;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  tiebreakAt?: number;

  @IsIn(['FULL', 'MATCH_TIEBREAK_10'])
  decidingSet: 'FULL' | 'MATCH_TIEBREAK_10';

  @IsBoolean()
  noAd: boolean;
}

export class CreatePresetDto {
  @IsUUID()
  clubId: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @ValidateNested()
  @Type(() => RuleSetDto)
  rules: RuleSetDto;
}

export class UpdatePresetDto {
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RuleSetDto)
  rules?: RuleSetDto;
}
