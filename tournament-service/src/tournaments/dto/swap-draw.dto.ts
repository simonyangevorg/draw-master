import { IsString } from 'class-validator';

export class SwapDrawDto {
  @IsString()
  participantId1: string;

  @IsString()
  participantId2: string;
}
