import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';
import { NormalizeEmail, Trim } from './normalize';

/**
 * Everyone signs up as a player (L-02). There is no role or club to pick:
 * clubs are joined afterwards, and admins are appointed by the super-admin.
 * Unknown fields (an old client still sending role/clubId) are stripped.
 */
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
}
