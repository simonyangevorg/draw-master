import { IsEmail, IsString, MaxLength } from 'class-validator';
import { NormalizeEmail } from './normalize';

export class LoginDto {
  @NormalizeEmail()
  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(128)
  password: string;
}
