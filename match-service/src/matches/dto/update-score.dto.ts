import { IsArray, IsOptional, IsString } from 'class-validator';

export class SetScore {
  p1: number;
  p2: number;
}

export class UpdateScoreDto {
  @IsArray()
  sets: SetScore[];

  @IsOptional()
  @IsString()
  winnerId?: string;
}
