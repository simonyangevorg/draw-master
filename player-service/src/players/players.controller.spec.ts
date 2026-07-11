import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';

describe('PlayersController', () => {
  let controller: PlayersController;

  const mockPlayersService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlayersController],
      providers: [{ provide: PlayersService, useValue: mockPlayersService }],
    }).compile();

    controller = module.get<PlayersController>(PlayersController);
  });

  describe('findOne', () => {
    it('propagates NotFoundException for a missing player', async () => {
      mockPlayersService.findOne.mockRejectedValue(new NotFoundException('Player not found'));

      await expect(controller.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('returns the underlying promise so delete failures propagate to the caller', async () => {
      mockPlayersService.remove.mockRejectedValue(new NotFoundException('Player not found'));

      await expect(controller.remove('missing')).rejects.toThrow(NotFoundException);
    });

    it('resolves when the delete succeeds', async () => {
      mockPlayersService.remove.mockResolvedValue(undefined);

      await expect(controller.remove('player-1')).resolves.toBeUndefined();
    });
  });
});
