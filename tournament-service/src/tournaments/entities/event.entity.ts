import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { TournamentEntity } from './tournament.entity';
import type { DrawFormat } from './tournament.entity';
import { RuleSet } from '../rules';

export type EventCategory = 'MEN' | 'WOMEN' | 'MIXED' | 'OPEN';
export type EventDiscipline = 'SINGLES' | 'DOUBLES';
export type EventStatus = 'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

/**
 * One competition inside a tournament (F-01): "Men's Singles", "Women's
 * Singles"... Each event has its own format, entries, draw and (F-12)
 * champion. The tournament's status rolls up from its events.
 *
 * Match rules are per stage (F-05): groupRules, knockoutRules, finalRules.
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

  /** The winning entry, once the event is complete (F-08/F-12). */
  @Column({ type: 'varchar', nullable: true })
  championEntryId: string | null;

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

  // ── Match rules per stage (F-05) ──
  // Copies, not references: changing a club preset never changes an event,
  // and an event's rules are locked once its draw is made.

  /** Round robin and the group stage. */
  @Column({ type: 'jsonb' })
  groupRules: RuleSet;

  /** Every knockout match except the final (when finalRules is set). */
  @Column({ type: 'jsonb' })
  knockoutRules: RuleSet;

  /** Optional: different rules for the final. */
  @Column({ type: 'jsonb', nullable: true })
  finalRules: RuleSet | null;

  @CreateDateColumn()
  createdAt: Date;
}
