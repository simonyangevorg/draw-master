import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { MatchResultDto } from './dto/match-result.dto';
import { SeedingRequestDto } from './dto/seeding-request.dto';
import { PlayerStatsEntity } from './entities/player-stats.entity';
import { H2HEntity } from './entities/h2h.entity';
import { AppliedResult, ProcessedEventEntity } from './entities/processed-event.entity';

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

type Repos = {
  stats: Repository<PlayerStatsEntity>;
  h2h: Repository<H2HEntity>;
  processed: Repository<ProcessedEventEntity>;
};

const toApplied = (dto: MatchResultDto): AppliedResult => ({
  player1Id: dto.player1Id,
  player2Id: dto.player2Id,
  winnerId: dto.winnerId,
  sets: (dto.sets ?? []).map((s) => ({ p1: s.p1, p2: s.p2 })),
  surface: dto.surface,
  outcome: dto.outcome ?? 'COMPLETED',
});

const sameResult = (a: AppliedResult, b: AppliedResult) =>
  a.player1Id === b.player1Id && a.player2Id === b.player2Id && a.winnerId === b.winnerId &&
  (a.surface ?? '') === (b.surface ?? '') && (a.outcome ?? 'COMPLETED') === (b.outcome ?? 'COMPLETED') &&
  JSON.stringify(a.sets) === JSON.stringify(b.sets);

/** A correction: the new result, plus the previous one as the publisher saw it. */
export type MatchCorrection = MatchResultDto & { previous?: MatchResultDto };

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(PlayerStatsEntity)
    private readonly statsRepo: Repository<PlayerStatsEntity>,
    @InjectRepository(H2HEntity)
    private readonly h2hRepo: Repository<H2HEntity>,
    @InjectRepository(ProcessedEventEntity)
    private readonly processedRepo: Repository<ProcessedEventEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /** Runs `work` in one transaction, so a result is applied (or reversed) entirely or not at all. */
  private inTransaction<T>(work: (repos: Repos) => Promise<T>): Promise<T> {
    return this.dataSource.transaction((em: EntityManager) => work({
      stats: em.getRepository(PlayerStatsEntity),
      h2h: em.getRepository(H2HEntity),
      processed: em.getRepository(ProcessedEventEntity),
    }));
  }

  private async getOrCreateStats(playerId: string, repo = this.statsRepo): Promise<PlayerStatsEntity> {
    const existing = await repo.findOne({ where: { playerId } });
    if (existing) return existing;
    return repo.save(repo.create(defaultStats(playerId)));
  }

  private async getOrCreateH2H(playerId: string, opponentId: string, repo = this.h2hRepo): Promise<H2HEntity> {
    const existing = await repo.findOne({ where: { playerId, opponentId } });
    if (existing) return existing;
    return repo.save(repo.create({ playerId, opponentId, wins: 0, losses: 0 }));
  }

  /** Adds a result to the aggregates (sign 1) or takes it back out (sign -1). */
  private async apply(r: AppliedResult, sign: 1 | -1, repos: Repos) {
    // A walkover is not a match played: it counts for nobody's record (F-06).
    if (r.outcome === 'WALKOVER') return;
    const loserId = r.winnerId === r.player1Id ? r.player2Id : r.player1Id;

    const p1Stats = await this.getOrCreateStats(r.player1Id, repos.stats);
    const p2Stats = await this.getOrCreateStats(r.player2Id, repos.stats);
    const winnerStats = r.winnerId === r.player1Id ? p1Stats : p2Stats;
    const loserStats = r.winnerId === r.player1Id ? p2Stats : p1Stats;

    winnerStats.matchesPlayed += sign;
    winnerStats.wins += sign;
    loserStats.matchesPlayed += sign;
    loserStats.losses += sign;

    // Each set goes to whichever side won more games in it (a 6-0 6-0 win is
    // 2 sets, not 12). Equal games (unfinished/retired set) count for nobody.
    for (const set of r.sets ?? []) {
      if (set.p1 > set.p2) {
        p1Stats.setsWon += sign;
        p2Stats.setsLost += sign;
      } else if (set.p2 > set.p1) {
        p2Stats.setsWon += sign;
        p1Stats.setsLost += sign;
      }
    }

    const surface = normalizeSurface(r.surface);
    if (surface) {
      winnerStats.surfaceWins = { ...winnerStats.surfaceWins, [surface]: (winnerStats.surfaceWins?.[surface] ?? 0) + sign };
    }

    await repos.stats.save([p1Stats, p2Stats]);

    const winnerH2H = await this.getOrCreateH2H(r.winnerId, loserId, repos.h2h);
    winnerH2H.wins += sign;
    const loserH2H = await this.getOrCreateH2H(loserId, r.winnerId, repos.h2h);
    loserH2H.losses += sign;
    await repos.h2h.save([winnerH2H, loserH2H]);
  }

  async recordResult(dto: MatchResultDto): Promise<{ recorded: string; duplicate?: true }> {
    return this.inTransaction(async (repos) => {
      // Idempotency: an event for a match we've already counted is a no-op.
      if (await repos.processed.findOne({ where: { matchId: dto.matchId } })) {
        return { recorded: dto.matchId, duplicate: true as const };
      }
      const result = toApplied(dto);
      await this.apply(result, 1, repos);
      await repos.processed.save(repos.processed.create({ matchId: dto.matchId, payload: result }));
      return { recorded: dto.matchId };
    });
  }

  /**
   * match.corrected (B-18): take the result we applied back out of every
   * aggregate and apply the corrected one. Idempotent: a redelivered
   * correction finds its own result already applied and changes nothing.
   */
  async correctResult(dto: MatchCorrection): Promise<{ corrected: string; unchanged?: true }> {
    return this.inTransaction(async (repos) => {
      const processed = await repos.processed.findOne({ where: { matchId: dto.matchId } });
      const next = toApplied(dto);
      if (!processed) {
        // The original was never counted (lost or dropped): just count this one.
        await this.apply(next, 1, repos);
        await repos.processed.save(repos.processed.create({ matchId: dto.matchId, payload: next }));
        return { corrected: dto.matchId };
      }
      // Rows from before B-18 don't say what was applied; trust the publisher's previous result.
      const applied = processed.payload ?? (dto.previous ? toApplied({ ...dto.previous, surface: dto.surface }) : null);
      if (!applied) throw new Error(`no record of the original result of match ${dto.matchId} to reverse`);
      if (sameResult(applied, next)) return { corrected: dto.matchId, unchanged: true as const };

      await this.apply(applied, -1, repos);
      await this.apply(next, 1, repos);
      processed.payload = next;
      await repos.processed.save(processed);
      return { corrected: dto.matchId };
    });
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
