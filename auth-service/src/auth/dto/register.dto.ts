import { IsEmail, IsString, MinLength, MaxLength, IsIn, IsOptional } from 'class-validator';
import { NormalizeEmail, Trim } from './normalize';

export class RegisterDto {
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsIn(['MEMBER', 'GUEST'])
  role?: 'MEMBER' | 'GUEST';

  @IsOptional()
  @IsString()
  clubId?: string;
}
