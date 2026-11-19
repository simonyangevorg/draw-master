import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type ClubRole = 'ADMIN' | 'MEMBER';
export type MembershipStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'LEFT' | 'REMOVED';

/**
 * A user's place in a club. ACTIVE rows go into the access token's `clubs`
 * claim; ADMIN is what lets someone run the club's tournaments (L-02/L-03).
 * Applying to join (PENDING → ACTIVE/REJECTED) arrives with L-05.
 */
@Entity('club_memberships')
@Index(['clubId', 'userId'], { unique: true })
export class ClubMembershipEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  clubId: string;

  @Index()
  @Column()
  userId: string;

  @Column({ type: 'varchar', default: 'MEMBER' })
  role: ClubRole;

  @Column({ type: 'varchar', default: 'PENDING' })
  status: MembershipStatus;

  @Column({ type: 'varchar', nullable: true })
  message: string | null;

  @Column({ type: 'varchar', nullable: true })
  decidedBy: string | null;

  @Column({ type: 'timestamp', nullable: true })
  decidedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
