import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PlayersService } from './players.service';
import { PlayerEntity } from './entities/player.entity';

function makePlayer(overrides: Partial<PlayerEntity> = {}): PlayerEntity {
  return {
    id: 'player-1',
    name: 'Test Player',
    country: 'USA',
    ranking: 10,
    age: 25,
    clubId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PlayerEntity;
}

describe('PlayersService', () => {
  let service: PlayersService;

  const mockRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayersService,
        { provide: getRepositoryToken(PlayerEntity), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<PlayersService>(PlayersService);
  });

  describe('findAll', () => {
    it('returns all players ordered by ranking', async () => {
      mockRepo.find.mockResolvedValue([makePlayer()]);

      const result = await service.findAll();

      expect(mockRepo.find).toHaveBeenCalledWith({ order: { ranking: 'ASC' } });
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('returns the player when found', async () => {
      mockRepo.findOne.mockResolvedValue(makePlayer({ id: 'player-2' }));

      const result = await service.findOne('player-2');

      expect(result.id).toBe('player-2');
    });

    it('throws NotFoundException when the player does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates and saves a player', async () => {
      mockRepo.create.mockImplementation((dto) => dto);
      mockRepo.save.mockImplementation(async (p) => ({ id: 'new-id', ...p }));

      const result = await service.create({ name: 'New Player', country: 'ESP' });

      expect(result).toEqual(expect.objectContaining({ id: 'new-id', name: 'New Player' }));
    });
  });

  describe('update', () => {
    it('throws NotFoundException when updating a missing player', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.update('missing', { name: 'X' })).rejects.toThrow(NotFoundException);
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('updates and returns the refreshed player', async () => {
      mockRepo.findOne
        .mockResolvedValueOnce(makePlayer())
        .mockResolvedValueOnce(makePlayer({ name: 'Updated Name' }));
      mockRepo.update.mockResolvedValue(undefined);

      const result = await service.update('player-1', { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when removing a missing player', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('deletes the player when it exists', async () => {
      mockRepo.findOne.mockResolvedValue(makePlayer());
      mockRepo.delete.mockResolvedValue(undefined);

      await service.remove('player-1');

      expect(mockRepo.delete).toHaveBeenCalledWith('player-1');
    });
  });
});
