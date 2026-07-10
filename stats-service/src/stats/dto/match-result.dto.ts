import { IsString, IsArray, IsOptional } from 'class-validator';

export class SetScore {
  p1: number;
  p2: number;
}

export class MatchResultDto {
  @IsString()
  matchId: string;

  @IsString()
  tournamentId: string;

  @IsString()
  player1Id: string;

  @IsString()
  player2Id: string;

  @IsString()
  winnerId: string;

  @IsArray()
  sets: SetScore[];

  @IsOptional()
  @IsString()
  surface?: string; // clay | grass | hard
}
