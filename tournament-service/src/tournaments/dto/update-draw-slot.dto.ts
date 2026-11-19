import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateDrawSlotDto {
  @IsIn(['participant1Id', 'participant2Id'])
  slot: 'participant1Id' | 'participant2Id';

  /** The participant to place in the slot; null or omitted empties it. */
  @IsOptional()
  @IsString()
  participantId?: string | null;
}
