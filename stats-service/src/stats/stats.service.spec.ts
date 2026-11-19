import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { StatsService } from './stats.service';
import { PlayerStatsEntity } from './entities/player-stats.entity';
import { H2HEntity } from './entities/h2h.entity';
import { ProcessedEventEntity } from './entities/processed-event.entity';

describe('StatsService', () => {
  let service: StatsService;

  const mockProcessedRepo = {
    findOne: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn(async (e) => e),
  };

  const mockStatsRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const mockH2HRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockStatsRepo.create.mockImplementation((data) => data);
    mockStatsRepo.save.mockImplementation(async (entities) =>
      Array.isArray(entities) ? entities : entities);
    mockH2HRepo.create.mockImplementation((data) => data);
    mockH2HRepo.save.mockImplementation(async (entities) =>
      Array.isArray(entities) ? entities : entities);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatsService,
        { provide: getRepositoryToken(PlayerStatsEntity), useValue: mockStatsRepo },
        { provide: getRepositoryToken(H2HEntity), useValue: mockH2HRepo },
        { provide: getRepositoryToken(ProcessedEventEntity), useValue: mockProcessedRepo },
        {
          provide: DataSource,
          useValue: {
            transaction: async (work: any) => work({
              getRepository: (e: any) => (e === PlayerStatsEntity ? mockStatsRepo : e === H2HEntity ? mockH2HRepo : mockProcessedRepo),
            }),
          },
        },
      ],
    }).compile();

    mockProcessedRepo.findOne.mockResolvedValue(null);
    mockProcessedRepo.create.mockImplementation((data) => data);
    mockProcessedRepo.save.mockImplementation(async (e) => e);

    service = module.get<StatsService>(StatsService);
  });

  describe('recordResult: set counting and idempotency', () => {
    const fresh = (id: string) => ({ playerId: id, matchesPlayed: 0, wins: 0, losses: 0, setsWon: 0, setsLost: 0, surfaceWins: { clay: 0, grass: 0, hard: 0 }, tournamentWins: 0 });

    it('counts sets won, not games (6-0 6-0 = 2 sets)', async () => {
      const p1 = fresh('p1');
      const p2 = fresh('p2');
      mockStatsRepo.findOne.mockResolvedValueOnce(p1).mockResolvedValueOnce(p2);
      mockH2HRepo.findOne.mockResolvedValue(null);

      await service.recordResult({
        matchId: 'm-sets', tournamentId: 't', player1Id: 'p1', player2Id: 'p2', winnerId: 'p1',
        sets: [{ p1: 6, p2: 0 }, { p1: 6, p2: 0 }],
      });

      expect(p1.setsWon).toBe(2);
      expect(p1.setsLost).toBe(0);
      expect(p2.setsWon).toBe(0);
      expect(p2.setsLost).toBe(2);
    });

    it('splits a three-set match 2-1', async () => {
      const p1 = fresh('p1');
      const p2 = fresh('p2');
      mockStatsRepo.findOne.mockResolvedValueOnce(p1).mockResolvedValueOnce(p2);
      mockH2HRepo.findOne.mockResolvedValue(null);

      await service.recordResult({
        matchId: 'm-3', tournamentId: 't', player1Id: 'p1', player2Id: 'p2', winnerId: 'p1',
        sets: [{ p1: 7, p2: 6 }, { p1: 4, p2: 6 }, { p1: 10, p2: 8 }],
      });

      expect(p1.setsWon).toBe(2);
      expect(p2.setsWon).toBe(1);
    });

    it('ignores an event whose matchId was already processed', async () => {
      mockProcessedRepo.findOne.mockResolvedValueOnce({ matchId: 'dup' });

      const result = await service.recordResult({
        matchId: 'dup', tournamentId: 't', player1Id: 'p1', player2Id: 'p2', winnerId: 'p1',
        sets: [{ p1: 6, p2: 0 }],
      });

      expect(result).toEqual({ recorded: 'dup', duplicate: true });
      expect(mockStatsRepo.save).not.toHaveBeenCalled();
      expect(mockH2HRepo.save).not.toHaveBeenCalled();
    });

    it('marks the matchId processed after applying it', async () => {
      mockStatsRepo.findOne.mockResolvedValueOnce(fresh('p1')).mockResolvedValueOnce(fresh('p2'));
      mockH2HRepo.findOne.mockResolvedValue(null);

      await service.recordResult({
        matchId: 'm-new', tournamentId: 't', player1Id: 'p1', player2Id: 'p2', winnerId: 'p1',
        sets: [{ p1: 6, p2: 4 }],
      });

      expect(mockProcessedRepo.save).toHaveBeenCalledWith({
        matchId: 'm-new',
        payload: expect.objectContaining({ player1Id: 'p1', player2Id: 'p2', winnerId: 'p1', sets: [{ p1: 6, p2: 4 }] }),
      });
    });
  });

  describe('recordResult', () => {
    it('creates fresh stats for both players when none exist yet', async () => {
      mockStatsRepo.findOne.mockResolvedValue(null);
      mockH2HRepo.findOne.mockResolvedValue(null);

      const result = await service.recordResult({
        matchId: 'm-1', tournamentId: 't-1', player1Id: 'p1', player2Id: 'p2', winnerId: 'p1',
        sets: [{ p1: 6, p2: 3 }],
      });

      expect(result).toEqual({ recorded: 'm-1' });
    });

    it('increments winner wins and loser losses', async () => {
      const p1Stats = { playerId: 'p1', matchesPlayed: 0, wins: 0, losses: 0, setsWon: 0, setsLost: 0, surfaceWins: { clay: 0, grass: 0, hard: 0 }, tournamentWins: 0 };
      const p2Stats = { playerId: 'p2', matchesPlayed: 0, wins: 0, losses: 0, setsWon: 0, setsLost: 0, surfaceWins: { clay: 0, grass: 0, hard: 0 }, tournamentWins: 0 };
      mockStatsRepo.findOne.mockResolvedValueOnce(p1Stats).mockResolvedValueOnce(p2Stats);
      mockH2HRepo.findOne.mockResolvedValue(null);

      await service.recordResult({
        matchId: 'm-1', tournamentId: 't-1', player1Id: 'p1', player2Id: 'p2', winnerId: 'p1',
        sets: [{ p1: 6, p2: 3 }],
      });

      expect(p1Stats.wins).toBe(1);
      expect(p1Stats.matchesPlayed).toBe(1);
      expect(p2Stats.losses).toBe(1);
      expect(p2Stats.matchesPlayed).toBe(1);
    });

    it('normalizes an unusual surface value into the tracked buckets', async () => {
      const p1Stats = { playerId: 'p1', matchesPlayed: 0, wins: 0, losses: 0, setsWon: 0, setsLost: 0, surfaceWins: { clay: 0, grass: 0, hard: 0 }, tournamentWins: 0 };
      const p2Stats = { playerId: 'p2', matchesPlayed: 0, wins: 0, losses: 0, setsWon: 0, setsLost: 0, surfaceWins: { clay: 0, grass: 0, hard: 0 }, tournamentWins: 0 };
      mockStatsRepo.findOne.mockResolvedValueOnce(p1Stats).mockResolvedValueOnce(p2Stats);
      mockH2HRepo.findOne.mockResolvedValue(null);

      await service.recordResult({
        matchId: 'm-1', tournamentId: 't-1', player1Id: 'p1', player2Id: 'p2', winnerId: 'p1',
        sets: [{ p1: 6, p2: 3 }], surface: 'hard_outdoor',
      });

      expect(p1Stats.surfaceWins.hard).toBe(1);
    });
  });

  describe('correctResult (B-18)', () => {
    const fresh = (id: string) => ({ playerId: id, matchesPlayed: 0, wins: 0, losses: 0, setsWon: 0, setsLost: 0, surfaceWins: { clay: 0, grass: 0, hard: 0 }, tournamentWins: 0 });
    let stats: Record<string, any>;
    let h2h: Record<string, any>;
    let processed: any;
    beforeEach(() => {
      stats = { p1: fresh('p1'), p2: fresh('p2') };
      h2h = {};
      processed = null;
      mockStatsRepo.findOne.mockImplementation(async ({ where }) => stats[where.playerId] ?? null);
      mockStatsRepo.create.mockImplementation((d) => (stats[d.playerId] = d));
      mockH2HRepo.findOne.mockImplementation(async ({ where }) => h2h[where.playerId + '>' + where.opponentId] ?? null);
      mockH2HRepo.create.mockImplementation((d) => (h2h[d.playerId + '>' + d.opponentId] = d));
      mockProcessedRepo.findOne.mockImplementation(async () => processed);
      mockProcessedRepo.save.mockImplementation(async (e) => (processed = e));
    });
    const result = (winnerId: string, sets: any[]) => ({
      matchId: 'm1', tournamentId: 't1', player1Id: 'p1', player2Id: 'p2', winnerId, sets, surface: 'clay',
    });
    const P1_WINS = [{ p1: 6, p2: 3 }, { p1: 6, p2: 2 }];
    const P2_WINS = [{ p1: 3, p2: 6 }, { p1: 2, p2: 6 }];

    it('flips wins, losses, sets, surface and H2H when the winner changes', async () => {
      await service.recordResult(result('p1', P1_WINS));
      await service.correctResult(result('p2', P2_WINS));

      expect(stats.p1).toMatchObject({ matchesPlayed: 1, wins: 0, losses: 1, setsWon: 0, setsLost: 2 });
      expect(stats.p2).toMatchObject({ matchesPlayed: 1, wins: 1, losses: 0, setsWon: 2, setsLost: 0 });
      expect(stats.p1.surfaceWins.clay).toBe(0);
      expect(stats.p2.surfaceWins.clay).toBe(1);
      expect(h2h['p1>p2']).toMatchObject({ wins: 0, losses: 1 });
      expect(h2h['p2>p1']).toMatchObject({ wins: 1, losses: 0 });
      expect(processed.payload.winnerId).toBe('p2');
    });

    it('a redelivered correction changes nothing', async () => {
      await service.recordResult(result('p1', P1_WINS));
      await service.correctResult(result('p2', P2_WINS));
      const r = await service.correctResult(result('p2', P2_WINS));
      expect(r.unchanged).toBe(true);
      expect(stats.p2).toMatchObject({ wins: 1, matchesPlayed: 1 });
    });

    it('a score-only correction fixes the set counts', async () => {
      await service.recordResult(result('p1', P1_WINS));
      await service.correctResult(result('p1', [{ p1: 6, p2: 3 }, { p1: 3, p2: 6 }, { p1: 6, p2: 1 }]));
      expect(stats.p1).toMatchObject({ wins: 1, setsWon: 2, setsLost: 1 });
      expect(stats.p2).toMatchObject({ losses: 1, setsWon: 1, setsLost: 2 });
    });

    it('rows from before B-18 (no payload) are reversed using the event previous result', async () => {
      await service.recordResult(result('p1', P1_WINS));
      processed = { matchId: 'm1', payload: null };
      await service.correctResult({ ...result('p2', P2_WINS), previous: result('p1', P1_WINS) });
      expect(stats.p1).toMatchObject({ wins: 0, losses: 1 });
      expect(stats.p2).toMatchObject({ wins: 1, losses: 0 });
    });

    it('a correction for a match never counted just counts it', async () => {
      await service.correctResult(result('p2', P2_WINS));
      expect(stats.p2).toMatchObject({ wins: 1, matchesPlayed: 1 });
      expect(stats.p1).toMatchObject({ losses: 1, matchesPlayed: 1 });
    });
  });

  describe('getPlayerStats', () => {
    it('computes win rate for a player with matches played', async () => {
      mockStatsRepo.findOne.mockResolvedValue({
        playerId: 'p1', matchesPlayed: 4, wins: 3, losses: 1, setsWon: 8, setsLost: 3,
        surfaceWins: { clay: 1, grass: 1, hard: 1 }, tournamentWins: 0,
      });

      const result = await service.getPlayerStats('p1');

      expect(result.winRate).toBe(0.75);
    });

    it('returns zero win rate for a player with no matches', async () => {
      mockStatsRepo.findOne.mockResolvedValue(null);

      const result = await service.getPlayerStats('brand-new-player');

      expect(result.winRate).toBe(0);
      expect(result.matchesPlayed).toBe(0);
    });
  });

  describe('computeSeedings', () => {
    it('ranks players by win rate, highest first', async () => {
      mockStatsRepo.findOne.mockImplementation(async ({ where: { playerId } }) => {
        const table: Record<string, any> = {
          strong: { playerId: 'strong', matchesPlayed: 10, wins: 9, losses: 1, setsWon: 0, setsLost: 0, surfaceWins: {}, tournamentWins: 0 },
          weak: { playerId: 'weak', matchesPlayed: 10, wins: 2, losses: 8, setsWon: 0, setsLost: 0, surfaceWins: {}, tournamentWins: 0 },
        };
        return table[playerId] ?? null;
      });

      const seeds = await service.computeSeedings({ playerIds: ['weak', 'strong'] });

      expect(seeds.strong).toBe(1);
      expect(seeds.weak).toBe(2);
    });
  });
});
