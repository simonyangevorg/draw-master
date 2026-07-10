import { IsString } from 'class-validator';

export class AddPlayerDto {
  @IsString()
  playerId: string;
}
