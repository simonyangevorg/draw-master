import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateScoreDto } from './dto/update-score.dto';
import { MatchEntity } from './entities/match.entity';

@Injectable()
export class MatchesService {
  constructor(
    @InjectRepository(MatchEntity)
    private readonly matchesRepo: Repository<MatchEntity>,
  ) {}

  findAll(tournamentId?: string): Promise<MatchEntity[]> {
    return this.matchesRepo.find(tournamentId ? { where: { tournamentId } } : {});
  }

  async findOne(id: string): Promise<MatchEntity> {
    const match = await this.matchesRepo.findOne({ where: { id } });
    if (!match) throw new NotFoundException('Match not found');
    return match;
  }

  create(dto: CreateMatchDto): Promise<MatchEntity> {
    const match = this.matchesRepo.create({
      tournamentId: dto.tournamentId,
      player1Id: dto.player1Id,
      player2Id: dto.player2Id,
      court: dto.court,
      scheduledAt: dto.scheduledAt,
      score: [],
      winnerId: null,
      status: 'scheduled',
    });
    return this.matchesRepo.save(match);
  }

  async updateScore(id: string, dto: UpdateScoreDto): Promise<MatchEntity> {
    const match = await this.findOne(id);
    if (match.status === 'completed') {
      throw new BadRequestException('Match already completed');
    }

    match.score = dto.sets;

    if (dto.winnerId) {
      if (dto.winnerId !== match.player1Id && dto.winnerId !== match.player2Id) {
        throw new BadRequestException('winnerId must be one of the two players');
      }
      match.winnerId = dto.winnerId;
      match.status = 'completed';
      // TODO: publish 'match.completed' event to RabbitMQ
    } else {
      match.status = 'in_progress';
    }

    return this.matchesRepo.save(match);
  }
}
