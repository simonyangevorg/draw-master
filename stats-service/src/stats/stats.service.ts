import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MatchResultDto } from './dto/match-result.dto';
import { SeedingRequestDto } from './dto/seeding-request.dto';
import { PlayerStatsEntity } from './entities/player-stats.entity';
import { H2HEntity } from './entities/h2h.entity';

const SURFACE_BUCKETS: Record<string, 'clay' | 'grass' | 'hard'> = {
  clay: 'clay',
  artificial_clay: 'clay',
  grass: 'grass',
  artificial_grass: 'grass',
  hard_outdoor: 'hard',
  hard_indoor: 'hard',
  carpet: 'hard',
  acrylic: 'hard',
};

function normalizeSurface(surface?: string): 'clay' | 'grass' | 'hard' | undefined {
  return surface ? SURFACE_BUCKETS[surface.toLowerCase()] : undefined;
}

function defaultStats(playerId: string): Partial<PlayerStatsEntity> {
  return {
    playerId,
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    setsWon: 0,
    setsLost: 0,
    surfaceWins: { clay: 0, grass: 0, hard: 0 },
    tournamentWins: 0,
  };
}

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(PlayerStatsEntity)
    private readonly statsRepo: Repository<PlayerStatsEntity>,
    @InjectRepository(H2HEntity)
    private readonly h2hRepo: Repository<H2HEntity>,
  ) {}

  private async getOrCreateStats(playerId: string): Promise<PlayerStatsEntity> {
    const existing = await this.statsRepo.findOne({ where: { playerId } });
    if (existing) return existing;
    return this.statsRepo.save(this.statsRepo.create(defaultStats(playerId)));
  }

  private async getOrCreateH2H(playerId: string, opponentId: string): Promise<H2HEntity> {
    const existing = await this.h2hRepo.findOne({ where: { playerId, opponentId } });
    if (existing) return existing;
    return this.h2hRepo.save(this.h2hRepo.create({ playerId, opponentId, wins: 0, losses: 0 }));
  }

  async recordResult(dto: MatchResultDto): Promise<{ recorded: string }> {
    const loserId = dto.winnerId === dto.player1Id ? dto.player2Id : dto.player1Id;

    const p1Stats = await this.getOrCreateStats(dto.player1Id);
    const p2Stats = await this.getOrCreateStats(dto.player2Id);
    const winnerStats = dto.winnerId === dto.player1Id ? p1Stats : p2Stats;
    const loserStats = dto.winnerId === dto.player1Id ? p2Stats : p1Stats;

    winnerStats.matchesPlayed++;
    winnerStats.wins++;
    loserStats.matchesPlayed++;
    loserStats.losses++;

    for (const set of dto.sets) {
      p1Stats.setsWon += set.p1;
      p1Stats.setsLost += set.p2;
      p2Stats.setsWon += set.p2;
      p2Stats.setsLost += set.p1;
    }

    const surface = normalizeSurface(dto.surface);
    if (surface) {
      winnerStats.surfaceWins[surface]++;
    }

    await this.statsRepo.save([p1Stats, p2Stats]);

    const winnerH2H = await this.getOrCreateH2H(dto.winnerId, loserId);
    winnerH2H.wins++;
    const loserH2H = await this.getOrCreateH2H(loserId, dto.winnerId);
    loserH2H.losses++;
    await this.h2hRepo.save([winnerH2H, loserH2H]);

    return { recorded: dto.matchId };
  }

  async getPlayerStats(playerId: string) {
    const s = await this.getOrCreateStats(playerId);
    const winRate = s.matchesPlayed > 0
      ? Math.round((s.wins / s.matchesPlayed) * 1000) / 1000
      : 0;
    return { ...s, winRate };
  }

  async getH2HRecord(playerId: string, opponentId: string) {
    const h = await this.getOrCreateH2H(playerId, opponentId);
    return { playerId: h.playerId, opponentId: h.opponentId, wins: h.wins, losses: h.losses };
  }

  async computeSeedings(dto: SeedingRequestDto): Promise<Record<string, number>> {
    const scored = await Promise.all(dto.playerIds.map(async (pid) => {
      const s = await this.getOrCreateStats(pid);
      const winRate = s.matchesPlayed > 0 ? s.wins / s.matchesPlayed : 0;
      return { pid, winRate, totalWins: s.wins };
    }));

    scored.sort((a, b) =>
      b.winRate !== a.winRate ? b.winRate - a.winRate : b.totalWins - a.totalWins,
    );

    return Object.fromEntries(scored.map(({ pid }, idx) => [pid, idx + 1]));
  }

  getTournamentReport(tournamentId: string) {
    return {
      tournamentId,
      note: 'Full report available once RabbitMQ event pipeline is connected.',
    };
  }
}
