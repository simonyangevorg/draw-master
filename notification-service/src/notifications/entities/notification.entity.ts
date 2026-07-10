import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('notifications')
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', default: 'sent' })
  status: 'sent';

  @Column()
  recipientId: string;

  @Column()
  channel: string;

  @Column()
  subject: string;

  @Column()
  body: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn()
  sentAt: Date;
}
