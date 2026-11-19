import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

export type Role = 'ORGANISER' | 'MEMBER' | 'GUEST';

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

  @Column({ type: 'varchar', default: 'GUEST' })
  role: Role;

  @Column({ nullable: true })
  clubId: string;

  @CreateDateColumn()
  createdAt: Date;
}
