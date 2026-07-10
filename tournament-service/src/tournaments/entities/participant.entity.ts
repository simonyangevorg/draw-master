import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { TournamentEntity } from './tournament.entity';

export type ParticipantStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';

@Entity('participants')
export class ParticipantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tournamentId: string;

  @ManyToOne(() => TournamentEntity, (t) => t.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tournamentId' })
  tournament: TournamentEntity;

  // Primary player (always required)
  @Column()
  playerId: string;

  // Partner (doubles only, nullable)
  @Column({ nullable: true })
  partnerId: string;

  @Column({ type: 'varchar', default: 'PENDING' })
  status: ParticipantStatus;

  // Seed assigned during draw generation
  @Column({ nullable: true })
  seed: number;

  // Group assignment (group stage)
  @Column({ nullable: true })
  groupId: string;

  @CreateDateColumn()
  registeredAt: Date;
}
