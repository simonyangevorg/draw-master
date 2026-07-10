import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateMatchDto {
  @IsOptional()
  @IsArray()
  sets?: { p1: number; p2: number }[];

  @IsOptional()
  @IsString()
  winnerId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  scheduledAt?: string;
}
