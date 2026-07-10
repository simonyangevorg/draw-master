import { IsString, IsOptional } from 'class-validator';

export class CreateMatchDto {
  @IsString()
  tournamentId: string;

  @IsString()
  player1Id: string;

  @IsString()
  player2Id: string;

  @IsOptional()
  @IsString()
  court?: string;

  @IsOptional()
  @IsString()
  scheduledAt?: string; // ISO 8601
}
