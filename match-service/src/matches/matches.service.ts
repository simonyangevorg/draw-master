import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateScoreDto, SetScore } from './dto/update-score.dto';

export interface Match {
  id: string;
  tournamentId: string;
  player1Id: string;
  player2Id: string;
  court?: string;
  scheduledAt?: string;
  score: SetScore[];
  winnerId: string | null;
  status: 'scheduled' | 'in_progress' | 'completed';
}

@Injectable()
export class MatchesService {
  private readonly matches = new Map<string, Match>();

  findAll(tournamentId?: string): Match[] {
    const all = [...this.matches.values()];
    return tournamentId ? all.filter(m => m.tournamentId === tournamentId) : all;
  }

  findOne(id: string): Match {
    const match = this.matches.get(id);
    if (!match) throw new NotFoundException('Match not found');
    return match;
  }

  create(dto: CreateMatchDto): Match {
    const match: Match = {
      id: uuidv4(),
      tournamentId: dto.tournamentId,
      player1Id: dto.player1Id,
      player2Id: dto.player2Id,
      court: dto.court,
      scheduledAt: dto.scheduledAt,
      score: [],
      winnerId: null,
      status: 'scheduled',
    };
    this.matches.set(match.id, match);
    return match;
  }

  updateScore(id: string, dto: UpdateScoreDto): Match {
    const match = this.findOne(id);
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

    return match;
  }
}
