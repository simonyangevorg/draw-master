import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, OneToMany,
} from 'typeorm';
import { ParticipantEntity } from './participant.entity';
import { TournamentMatchEntity } from './match.entity';
import { TournamentGroupEntity } from './group.entity';
import { EventEntity } from './event.entity';

export type TournamentStatus = 'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type TournamentType = 'SINGLES_MEN' | 'SINGLES_WOMEN' | 'DOUBLES_MEN' | 'DOUBLES_WOMEN' | 'MIXED_DOUBLES';
export type DrawFormat = 'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION' | 'ROUND_ROBIN' | 'GROUP_STAGE_KNOCKOUT';
export type Surface = 'CLAY' | 'HARD_OUTDOOR' | 'HARD_INDOOR' | 'GRASS' | 'CARPET' | 'ACRYLIC' | 'ARTIFICIAL_CLAY' | 'ARTIFICIAL_GRASS';
export type Visibility = 'CLUB' | 'PUBLIC';
export type AgeGroup = 'OPEN' | 'U18' | 'U16' | 'U14' | 'SENIOR_40';

@Entity('tournaments')
export class TournamentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ── Identity ──
  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  /** Who created it. Audit only: rights come from the club (L-06). */
  @Column()
  createdBy: string;

  /** The club that runs it. Null only for tournaments from before clubs (until L-07). */
  @Column({ type: 'varchar', nullable: true })
  clubId: string | null;

  // ── Location ──
  @Column({ nullable: true })
  venue: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  country: string;

  // ── Dates ──
  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  @Column({ type: 'date', nullable: true })
  registrationDeadline: string;

  // ── Status & access ──
  @Column({ type: 'varchar', default: 'DRAFT' })
  status: TournamentStatus;

  /** CLUB: members of the club (and entrants) see it. PUBLIC: anyone (L-06). */
  @Column({ type: 'varchar', default: 'CLUB' })
  visibility: Visibility;

  @Column({ default: false })
  requiresApproval: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  entryFee: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  prizePool: number;

  @Column({ nullable: true })
  rankingPoints: number;

  // ── Venue ──
  @Column({ type: 'varchar', default: 'CLAY' })
  surface: Surface;

  @Column({ type: 'varchar', default: 'OPEN' })
  ageGroup: AgeGroup;

  // Format, size, seeding, groups and match rules belong to each event (F-01).

  // ── Relations ──
  @OneToMany(() => ParticipantEntity, (p) => p.tournament, { cascade: true })
  participants: ParticipantEntity[];

  @OneToMany(() => TournamentMatchEntity, (m) => m.tournament, { cascade: true })
  matches: TournamentMatchEntity[];

  @OneToMany(() => TournamentGroupEntity, (g) => g.tournament, { cascade: true })
  groups: TournamentGroupEntity[];

  @OneToMany(() => EventEntity, (e) => e.tournament, { cascade: true })
  events: EventEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
