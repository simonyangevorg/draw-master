import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('player_stats')
export class PlayerStatsEntity {
  @PrimaryColumn()
  playerId: string;

  @Column({ default: 0 })
  matchesPlayed: number;

  @Column({ default: 0 })
  wins: number;

  @Column({ default: 0 })
  losses: number;

  @Column({ default: 0 })
  setsWon: number;

  @Column({ default: 0 })
  setsLost: number;

  @Column({ type: 'jsonb' })
  surfaceWins: Record<string, number>;

  @Column({ default: 0 })
  tournamentWins: number;
}
