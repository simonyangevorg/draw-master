import { IsArray, IsString } from 'class-validator';

export class SeedingRequestDto {
  @IsArray()
  @IsString({ each: true })
  playerIds: string[];
}
