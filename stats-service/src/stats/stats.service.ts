import { Injectable } from '@nestjs/common';
import { MatchResultDto } from './dto/match-result.dto';
import { SeedingRequestDto } from './dto/seeding-request.dto';

interface PlayerStats {
  matchesPlayed: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  surfaceWins: Record<string, number>;
  tournamentWins: number;
}

interface H2HRecord {
  wins: number;
  losses: number;
}

function defaultStats(): PlayerStats {
  return {
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
  private readonly stats = new Map<string, PlayerStats>();
  private readonly h2h = new Map<string, H2HRecord>(); // key: "playerId:opponentId"

  private getStats(playerId: string): PlayerStats {
    if (!this.stats.has(playerId)) this.stats.set(playerId, defaultStats());
    return this.stats.get(playerId);
  }

  private h2hKey(a: string, b: string): string {
    return `${a}:${b}`;
  }

  private getH2H(a: string, b: string): H2HRecord {
    const key = this.h2hKey(a, b);
    if (!this.h2h.has(key)) this.h2h.set(key, { wins: 0, losses: 0 });
    return this.h2h.get(key);
  }

  recordResult(dto: MatchResultDto): { recorded: string } {
    const loserId = dto.winnerId === dto.player1Id ? dto.player2Id : dto.player1Id;

    const winnerStats = this.getStats(dto.winnerId);
    const loserStats = this.getStats(loserId);

    winnerStats.matchesPlayed++;
    winnerStats.wins++;
    loserStats.matchesPlayed++;
    loserStats.losses++;

    for (const set of dto.sets) {
      this.getStats(dto.player1Id).setsWon += set.p1;
      this.getStats(dto.player1Id).setsLost += set.p2;
      this.getStats(dto.player2Id).setsWon += set.p2;
      this.getStats(dto.player2Id).setsLost += set.p1;
    }

    if (dto.surface && dto.surface in winnerStats.surfaceWins) {
      winnerStats.surfaceWins[dto.surface]++;
    }

    this.getH2H(dto.winnerId, loserId).wins++;
    this.getH2H(loserId, dto.winnerId).losses++;

    return { recorded: dto.matchId };
  }

  getPlayerStats(playerId: string) {
    const s = this.getStats(playerId);
    const winRate = s.matchesPlayed > 0
      ? Math.round((s.wins / s.matchesPlayed) * 1000) / 1000
      : 0;
    return { playerId, ...s, winRate };
  }

  getH2HRecord(playerId: string, opponentId: string) {
    return {
      playerId,
      opponentId,
      ...this.getH2H(playerId, opponentId),
    };
  }

  computeSeedings(dto: SeedingRequestDto): Record<string, number> {
    const scored = dto.playerIds.map(pid => {
      const s = this.getStats(pid);
      const winRate = s.matchesPlayed > 0 ? s.wins / s.matchesPlayed : 0;
      return { pid, winRate, totalWins: s.wins };
    });

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
