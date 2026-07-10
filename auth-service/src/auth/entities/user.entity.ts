import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

export type Role = 'ORGANISER' | 'MEMBER' | 'GUEST';

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
