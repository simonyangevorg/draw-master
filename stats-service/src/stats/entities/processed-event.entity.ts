import { Entity, PrimaryColumn, CreateDateColumn, Column } from 'typeorm';

/** The part of a match result that the stats tables were built from. */
export interface AppliedResult {
  player1Id: string;
  player2Id: string;
  winnerId: string;        // a player ID
  sets: { p1: number; p2: number }[];
  surface?: string;
  /** COMPLETED, RETIRED, WALKOVER or DEFAULT (F-06); walkovers change no aggregates. */
  outcome?: string;
}

/**
 * One row per match already applied to the stats tables.
 * RabbitMQ delivers at-least-once, so this is what keeps stats from
 * double-counting; `payload` records exactly what was applied, so a later
 * match.corrected can reverse it (B-18). Rows from before B-18 have no payload.
 */
@Entity('processed_events')
export class ProcessedEventEntity {
  @PrimaryColumn()
  matchId: string;

  @Column({ type: 'jsonb', nullable: true })
  payload: AppliedResult | null;

  @CreateDateColumn()
  processedAt: Date;
}
