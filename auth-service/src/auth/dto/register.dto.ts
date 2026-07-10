import { IsEmail, IsString, MinLength, IsIn, IsOptional } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsIn(['MEMBER', 'GUEST'])
  role?: 'MEMBER' | 'GUEST';

  @IsOptional()
  @IsString()
  clubId?: string;
}
