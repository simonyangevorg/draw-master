import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

describe('NotificationsController', () => {
  let controller: NotificationsController;

  const mockNotificationsService = {
    send: jest.fn(),
    findByRecipient: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: mockNotificationsService }],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  describe('handleMatchCompleted', () => {
    it('notifies both the winner and the loser', () => {
      controller.handleMatchCompleted({
        matchId: 'm-1', tournamentId: 't-1', tournamentName: 'Spring Open',
        winnerPlayerId: 'winner-1', loserPlayerId: 'loser-1', round: 2,
      });

      expect(mockNotificationsService.send).toHaveBeenCalledTimes(2);
      expect(mockNotificationsService.send).toHaveBeenCalledWith(
        expect.objectContaining({ recipientId: 'winner-1', body: expect.stringContaining('won') }),
      );
      expect(mockNotificationsService.send).toHaveBeenCalledWith(
        expect.objectContaining({ recipientId: 'loser-1' }),
      );
    });

    it('labels the match as Group Stage when stage is GROUP', () => {
      controller.handleMatchCompleted({
        matchId: 'm-1', tournamentId: 't-1', tournamentName: 'Spring Open',
        winnerPlayerId: 'winner-1', loserPlayerId: 'loser-1', stage: 'GROUP',
      });

      expect(mockNotificationsService.send).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.stringContaining('Group Stage') }),
      );
    });
  });
});
