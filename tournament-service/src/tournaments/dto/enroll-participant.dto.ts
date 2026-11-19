import { IsString, IsOptional, IsUUID } from 'class-validator';

export class EnrollParticipantDto {
  @IsString()
  playerId: string;

  /** The event to enter (F-01). Optional while the tournament has one event. */
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsOptional()
  @IsString()
  partnerId?: string; // doubles only
}
