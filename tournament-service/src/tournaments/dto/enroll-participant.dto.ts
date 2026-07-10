import { IsString, IsOptional } from 'class-validator';

export class EnrollParticipantDto {
  @IsString()
  playerId: string;

  @IsOptional()
  @IsString()
  partnerId?: string; // doubles only
}
