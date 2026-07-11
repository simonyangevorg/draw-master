import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StatsService } from './stats.service';
import { PlayerStatsEntity } from './entities/player-stats.entity';
import { H2HEntity } from './entities/h2h.entity';

describe('StatsService', () => {
  let service: StatsService;

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
      ],
    }).compile();

    service = module.get<StatsService>(StatsService);
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
