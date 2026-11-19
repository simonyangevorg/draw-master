import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type ClubStatus = 'ACTIVE' | 'INACTIVE';

/** A club on the platform (L-03). Only the super-admin creates and edits them. */
@Entity('clubs')
export class ClubEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'varchar', nullable: true })
  city: string | null;

  @Column({ type: 'varchar', nullable: true })
  country: string | null;

  @Column({ type: 'varchar', nullable: true })
  contactEmail: string | null;

  @Column({ type: 'varchar', nullable: true })
  logoUrl: string | null;

  /** INACTIVE clubs drop out of the directory and their tournaments are hidden. */
  @Column({ type: 'varchar', default: 'ACTIVE' })
  status: ClubStatus;

  @Column()
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
