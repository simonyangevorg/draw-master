import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlayerEntity } from './entities/player.entity';
import { CreatePlayerDto } from './dto/create-player.dto';
import { UpdatePlayerDto } from './dto/update-player.dto';

@Injectable()
export class PlayersService {
  constructor(
    @InjectRepository(PlayerEntity)
    private readonly repo: Repository<PlayerEntity>,
  ) {}

  findAll(): Promise<PlayerEntity[]> {
    return this.repo.find({ order: { ranking: 'ASC' } });
  }

  async findOne(id: string): Promise<PlayerEntity> {
    const player = await this.repo.findOne({ where: { id } });
    if (!player) throw new NotFoundException('Player not found');
    return player;
  }

  create(dto: CreatePlayerDto): Promise<PlayerEntity> {
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: string, dto: UpdatePlayerDto): Promise<PlayerEntity> {
    await this.findOne(id);
    await this.repo.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.repo.delete(id);
  }
}
