import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, OneToMany,
} from 'typeorm';
import { ParticipantEntity } from './participant.entity';
import { TournamentMatchEntity } from './match.entity';
import { TournamentGroupEntity } from './group.entity';

export type TournamentStatus = 'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type TournamentType = 'SINGLES_MEN' | 'SINGLES_WOMEN' | 'DOUBLES_MEN' | 'DOUBLES_WOMEN' | 'MIXED_DOUBLES';
export type DrawFormat = 'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION' | 'ROUND_ROBIN' | 'GROUP_STAGE_KNOCKOUT';
export type Surface = 'CLAY' | 'HARD_OUTDOOR' | 'HARD_INDOOR' | 'GRASS' | 'CARPET' | 'ACRYLIC' | 'ARTIFICIAL_CLAY' | 'ARTIFICIAL_GRASS';
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

  @Column()
  organiserId: string;

  @Column({ nullable: true })
  clubId: string;

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

  @Column({ default: true })
  isPublic: boolean;

  @Column({ default: false })
  requiresApproval: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  entryFee: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  prizePool: number;

  @Column({ nullable: true })
  rankingPoints: number;

  // ── Type & format ──
  @Column({ type: 'varchar' })
  tournamentType: TournamentType;

  @Column({ type: 'varchar' })
  drawFormat: DrawFormat;

  @Column({ type: 'varchar', default: 'CLAY' })
  surface: Surface;

  @Column({ type: 'varchar', default: 'OPEN' })
  ageGroup: AgeGroup;

  // ── Participants ──
  @Column({ default: 32 })
  maxParticipants: number;

  @Column({ default: 4 })
  minParticipants: number;

  @Column({ default: true })
  seeded: boolean;

  // ── Match format ──
  @Column({ default: 2 })
  setsToWin: number;          // 1 = best of 1, 2 = best of 3, 3 = best of 5

  @Column({ default: 6 })
  gamesPerSet: number;

  @Column({ default: 6 })
  tiebreakAt: number;

  @Column({ default: false })
  finalSetTiebreak: boolean;

  @Column({ default: false })
  noAd: boolean;

  // ── Group stage ──
  @Column({ nullable: true })
  numberOfGroups: number;

  @Column({ nullable: true })
  advancePerGroup: number;

  // ── Relations ──
  @OneToMany(() => ParticipantEntity, (p) => p.tournament, { cascade: true })
  participants: ParticipantEntity[];

  @OneToMany(() => TournamentMatchEntity, (m) => m.tournament, { cascade: true })
  matches: TournamentMatchEntity[];

  @OneToMany(() => TournamentGroupEntity, (g) => g.tournament, { cascade: true })
  groups: TournamentGroupEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
