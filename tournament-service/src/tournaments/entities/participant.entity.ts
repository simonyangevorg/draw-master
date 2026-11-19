import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { TournamentEntity } from './tournament.entity';

export type ParticipantStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';

@Entity('participants')
// A player enters each event once (F-01).
@Index(['eventId', 'playerId'], { unique: true })
export class ParticipantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tournamentId: string;

  @ManyToOne(() => TournamentEntity, (t) => t.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tournamentId' })
  tournament: TournamentEntity;

  /** The event this belongs to (F-01). */
  @Index()
  @Column()
  eventId: string;

  // Primary player (always required)
  @Index()
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
