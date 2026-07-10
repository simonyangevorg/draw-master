import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { SetScore } from '../dto/update-score.dto';

@Entity('matches')
export class MatchEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tournamentId: string;

  @Column()
  player1Id: string;

  @Column()
  player2Id: string;

  @Column({ nullable: true })
  court?: string;

  @Column({ nullable: true })
  scheduledAt?: string;

  @Column({ type: 'jsonb', default: [] })
  score: SetScore[];

  @Column({ nullable: true })
  winnerId: string | null;

  @Column({ type: 'varchar', default: 'scheduled' })
  status: 'scheduled' | 'in_progress' | 'completed';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
