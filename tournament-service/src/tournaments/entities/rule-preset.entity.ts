import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { RuleSet } from '../rules';

/**
 * A named match-rule set (F-05). clubId null = built in, offered to every
 * club and never editable; otherwise the club's own, managed by its admins.
 */
@Entity('match_rule_presets')
export class RulePresetEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', nullable: true })
  clubId: string | null;

  @Column()
  name: string;

  @Column({ type: 'jsonb' })
  rules: RuleSet;

  @Column({ type: 'varchar', nullable: true })
  createdBy: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
