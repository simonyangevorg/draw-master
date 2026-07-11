import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { MatchEntity } from './entities/match.entity';

function makeMatch(overrides: Partial<MatchEntity> = {}): MatchEntity {
  return {
    id: 'match-1',
    tournamentId: 'tournament-1',
    player1Id: 'p1',
    player2Id: 'p2',
    court: 'Court 1',
    scheduledAt: undefined,
    score: [],
    winnerId: null,
    status: 'scheduled',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as MatchEntity;
}

describe('MatchesService', () => {
  let service: MatchesService;

  const mockRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchesService,
        { provide: getRepositoryToken(MatchEntity), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<MatchesService>(MatchesService);
  });

  describe('findOne', () => {
    it('returns the match when found', async () => {
      mockRepo.findOne.mockResolvedValue(makeMatch());

      const result = await service.findOne('match-1');

      expect(result.id).toBe('match-1');
    });

    it('throws NotFoundException when the match does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates a match with scheduled status and no winner', async () => {
      mockRepo.create.mockImplementation((data) => data);
      mockRepo.save.mockImplementation(async (m) => ({ id: 'new-match', ...m }));

      const result = await service.create({
        tournamentId: 'tournament-1', player1Id: 'p1', player2Id: 'p2',
      });

      expect(result.status).toBe('scheduled');
      expect(result.winnerId).toBeNull();
    });
  });

  describe('updateScore', () => {
    it('throws BadRequestException when the match is already completed', async () => {
      mockRepo.findOne.mockResolvedValue(makeMatch({ status: 'completed' }));

      await expect(
        service.updateScore('match-1', { sets: [{ p1: 6, p2: 3 }] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when winnerId is not one of the two players', async () => {
      mockRepo.findOne.mockResolvedValue(makeMatch());

      await expect(
        service.updateScore('match-1', { sets: [{ p1: 6, p2: 3 }], winnerId: 'someone-else' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('sets status to in_progress when no winner is given', async () => {
      mockRepo.findOne.mockResolvedValue(makeMatch());
      mockRepo.save.mockImplementation(async (m) => m);

      const result = await service.updateScore('match-1', { sets: [{ p1: 6, p2: 3 }] });

      expect(result.status).toBe('in_progress');
    });

    it('sets status to completed and records the winner', async () => {
      mockRepo.findOne.mockResolvedValue(makeMatch());
      mockRepo.save.mockImplementation(async (m) => m);

      const result = await service.updateScore('match-1', {
        sets: [{ p1: 6, p2: 3 }, { p1: 6, p2: 4 }], winnerId: 'p1',
      });

      expect(result.status).toBe('completed');
      expect(result.winnerId).toBe('p1');
    });
  });
});
