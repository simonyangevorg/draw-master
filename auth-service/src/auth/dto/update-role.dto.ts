import { IsIn } from 'class-validator';

/** Platform role only; running a club is a club-admin seat (L-03), not a role. */
export class UpdateRoleDto {
  @IsIn(['SUPER_ADMIN', 'PLAYER'])
  role: 'SUPER_ADMIN' | 'PLAYER';
}
