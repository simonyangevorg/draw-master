import { Entity, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';

@Entity('h2h_records')
@Unique(['playerId', 'opponentId'])
export class H2HEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  playerId: string;

  @Column()
  opponentId: string;

  @Column({ default: 0 })
  wins: number;

  @Column({ default: 0 })
  losses: number;
}
