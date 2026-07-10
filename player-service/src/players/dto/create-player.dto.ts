import { IsString, IsOptional, IsInt, Min } from 'class-validator';

export class CreatePlayerDto {
  @IsString()
  name: string;

  @IsString()
  country: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  ranking?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  age?: number;
}
