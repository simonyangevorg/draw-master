import { Entity, PrimaryColumn, CreateDateColumn } from 'typeorm';

/**
 * One row per match.completed event already applied to the stats tables.
 * RabbitMQ delivers at-least-once, and a re-scored match republishes the same
 * matchId, so this is what keeps stats from double-counting.
 */
@Entity('processed_events')
export class ProcessedEventEntity {
  @PrimaryColumn()
  matchId: string;

  @CreateDateColumn()
  processedAt: Date;
}
