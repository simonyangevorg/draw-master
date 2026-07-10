import { IsIn } from 'class-validator';

export class UpdateRoleDto {
  @IsIn(['ORGANISER', 'MEMBER', 'GUEST'])
  role: 'ORGANISER' | 'MEMBER' | 'GUEST';
}
