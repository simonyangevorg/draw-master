import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { TournamentEntity } from './tournament.entity';

export type MatchStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'WALKOVER' | 'BYE';
export type MatchStage = 'GROUP' | 'KNOCKOUT';

@Entity('tournament_matches')
export class TournamentMatchEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tournamentId: string;

  @ManyToOne(() => TournamentEntity, (t) => t.matches, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tournamentId' })
  tournament: TournamentEntity;

  /** The event this belongs to (F-01). */
  @Index()
  @Column()
  eventId: string;

  @Column({ type: 'varchar', default: 'KNOCKOUT' })
  stage: MatchStage;

  // Bracket position
  @Column()
  round: number;         // 1 = Round of 64, 2 = R32... last = Final

  @Column()
  position: number;      // position within the round (0-indexed)

  // Participant IDs (participant record ID, not player ID directly)
  @Column({ nullable: true })
  participant1Id: string;

  @Column({ nullable: true })
  participant2Id: string;

  @Column({ nullable: true })
  winnerId: string;      // participant ID of winner

  // Where the winner advances to
  @Column({ nullable: true })
  nextMatchId: string;

  // Which side of the next match the winner takes: 1 = participant1Id,
  // 2 = participant2Id. Fixed by bracket position at draw time, never by
  // "whichever slot is empty" (that put winners on the wrong side).
  @Column({ type: 'int', nullable: true })
  nextSlot: number;

  // Score per set: {p1, p2, tb? (loser's tiebreak points), isMatchTiebreak?} (F-06)
  @Column({ type: 'jsonb', nullable: true })
  sets: { p1: number; p2: number; tb?: number; isMatchTiebreak?: boolean }[];

  /** How it ended: COMPLETED, RETIRED, WALKOVER or DEFAULT (F-06). Null before a result. */
  @Column({ type: 'varchar', nullable: true })
  outcome: string | null;

  @Column({ type: 'varchar', default: 'SCHEDULED' })
  status: MatchStatus;

  @Column({ nullable: true })
  groupId: string;

  // Pre-assigned group slot labels for knockout matches, e.g. "A1", "C2"
  @Column({ nullable: true })
  slot1: string;

  @Column({ nullable: true })
  slot2: string;

  @Column({ type: 'timestamp', nullable: true })
  scheduledAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;
}
