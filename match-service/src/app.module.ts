import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchesModule } from './matches/matches.module';
import { MatchEntity } from './matches/entities/match.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [MatchEntity],
      synchronize: true,
    }),
    MatchesModule,
  ],
})
export class AppModule {}
