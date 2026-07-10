import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('players')
export class PlayerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ length: 3 })
  country: string;

  @Column({ nullable: true })
  ranking: number | null;

  @Column({ nullable: true })
  age: number | null;

  @Column({ nullable: true })
  clubId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
