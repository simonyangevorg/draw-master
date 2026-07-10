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

  @IsIn(['ORGANISER', 'MEMBER', 'GUEST'])
  role: 'ORGANISER' | 'MEMBER' | 'GUEST';

  @IsOptional()
  @IsString()
  clubId?: string;
}
