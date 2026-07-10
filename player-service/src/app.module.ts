import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlayersModule } from './players/players.module';
import { PlayerEntity } from './players/entities/player.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [PlayerEntity],
      synchronize: true,
    }),
    PlayersModule,
  ],
})
export class AppModule {}
