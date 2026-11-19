import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

/**
 * tournament-service's own copy of each club's name and status, kept up to
 * date from auth-service's club.upserted events (dev plan §1.1, §1.3: no
 * cross-service reads). Used to label tournaments and hide those of an
 * INACTIVE club.
 */
@Entity('clubs')
export class ClubRefEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @Column()
  slug: string;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
