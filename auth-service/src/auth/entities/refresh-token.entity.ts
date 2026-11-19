import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * One issued refresh token (L-17). Only a SHA-256 hash of the token is
 * stored, so a database leak hands out no working sessions. Every refresh
 * rotates: the old row is revoked and points at its replacement. Presenting
 * a revoked token again means it was copied, so the whole family is revoked.
 */
@Entity('refresh_tokens')
export class RefreshTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @Index({ unique: true })
  @Column()
  tokenHash: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  /** The token this one was swapped for, when it was rotated. */
  @Column({ type: 'varchar', nullable: true })
  replacedBy: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
