import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { TournamentEntity } from './tournament.entity';
import type { DrawFormat } from './tournament.entity';

export type EventCategory = 'MEN' | 'WOMEN' | 'MIXED' | 'OPEN';
export type EventDiscipline = 'SINGLES' | 'DOUBLES';
export type EventStatus = 'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

/**
 * One competition inside a tournament (F-01): "Men's Singles", "Women's
 * Singles"... Each event has its own format, entries, draw and (F-12)
 * champion. The tournament's status rolls up from its events.
 *
 * Match rules (setsToWin ... noAd) live here until F-05 turns them into
 * per-stage rule sets.
 */
@Entity('events')
export class EventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  tournamentId: string;

  @ManyToOne(() => TournamentEntity, (t) => t.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tournamentId' })
  tournament: TournamentEntity;

  @Column()
  name: string;

  /** Display order within the tournament. */
  @Column({ default: 0 })
  position: number;

  @Column({ type: 'varchar', default: 'OPEN' })
  category: EventCategory;

  @Column({ type: 'varchar', default: 'SINGLES' })
  discipline: EventDiscipline;

  @Column({ type: 'varchar' })
  drawFormat: DrawFormat;

  @Column({ type: 'varchar', default: 'DRAFT' })
  status: EventStatus;

  // ── Size and seeding ──
  @Column({ default: 32 })
  maxParticipants: number;

  @Column({ default: 4 })
  minParticipants: number;

  @Column({ default: true })
  seeded: boolean;

  // ── Group stage ──
  @Column({ type: 'int', nullable: true })
  numberOfGroups: number | null;

  @Column({ type: 'int', nullable: true })
  advancePerGroup: number | null;

  // ── Match rules (until F-05) ──
  @Column({ default: 2 })
  setsToWin: number;

  @Column({ default: 6 })
  gamesPerSet: number;

  @Column({ default: 6 })
  tiebreakAt: number;

  @Column({ default: false })
  finalSetTiebreak: boolean;

  @Column({ default: false })
  noAd: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
