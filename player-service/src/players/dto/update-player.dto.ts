import { IsString, IsOptional, IsInt, Min } from 'class-validator';

export class UpdatePlayerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  ranking?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  age?: number;
}
