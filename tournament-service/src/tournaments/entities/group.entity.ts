import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
} from 'typeorm';
import { TournamentEntity } from './tournament.entity';

@Entity('tournament_groups')
export class TournamentGroupEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tournamentId: string;

  @ManyToOne(() => TournamentEntity, (t) => t.groups, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tournamentId' })
  tournament: TournamentEntity;

  @Column()
  name: string;          // "Group A", "Group B", ...

  @Column()
  position: number;      // 0-indexed

  // Participant IDs in this group (stored as array)
  @Column({ type: 'jsonb', default: '[]' })
  participantIds: string[];
}
