import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

/**
 * Platform roles (L-02). Running a club is not a platform role: it is a
 * club membership with role ADMIN (see ClubMembershipEntity).
 */
export type Role = 'SUPER_ADMIN' | 'PLAYER';

// Case-insensitive uniqueness (B-12). An expression index TypeORM can't model,
// so it lives in the EmailLowercase migration and is excluded from sync/diff.
@Index('UQ_users_email_lower', { synchronize: false })
@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  name: string;

  @Column()
  passwordHash: string;

  @Column({ type: 'varchar', default: 'PLAYER' })
  role: Role;

  /** Set for the bootstrapped super-admin: the first sign-in must pick a new password. */
  @Column({ default: false })
  mustChangePassword: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
