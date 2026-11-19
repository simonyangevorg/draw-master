import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { UserEntity } from './auth/entities/user.entity';
import { ClubEntity } from './auth/entities/club.entity';
import { ClubMembershipEntity } from './auth/entities/club-membership.entity';
import { MIGRATIONS } from './migrations';

/**
 * Single source of truth for the DB connection, shared by the Nest app and the
 * TypeORM CLI (npm run migration:*). The schema is owned by migrations
 * (dev plan L-01): synchronize stays off so an entity edit can never silently
 * alter or drop production columns. Pending migrations run on boot.
 */
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [UserEntity, ClubEntity, ClubMembershipEntity],
  migrations: MIGRATIONS,
  synchronize: false,
};

export default new DataSource(dataSourceOptions);
