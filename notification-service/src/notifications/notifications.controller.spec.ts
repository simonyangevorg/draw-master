import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
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
    it('notifies both the winner and the loser', async () => {
      await controller.notifyMatchCompleted({
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

    it('labels the match as Group Stage when stage is GROUP', async () => {
      await controller.notifyMatchCompleted({
        matchId: 'm-1', tournamentId: 't-1', tournamentName: 'Spring Open',
        winnerPlayerId: 'winner-1', loserPlayerId: 'loser-1', stage: 'GROUP',
      });

      expect(mockNotificationsService.send).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.stringContaining('Group Stage') }),
      );
    });
  });

  describe('handleMatchCompleted (RabbitMQ ack)', () => {
    const event = {
      matchId: 'm-1', tournamentId: 't-1', tournamentName: 'Spring Open',
      winnerPlayerId: 'winner-1', loserPlayerId: 'loser-1', round: 1,
    };
    const makeCtx = () => {
      const channel = { ack: jest.fn(), nack: jest.fn() };
      const msg = { id: 'raw' };
      const ctx: any = { getChannelRef: () => channel, getMessage: () => msg };
      return { ctx, channel, msg };
    };

    it('acks the message after both notifications are stored', async () => {
      mockNotificationsService.send.mockResolvedValue({});
      const { ctx, channel, msg } = makeCtx();

      await controller.handleMatchCompleted(event, ctx);

      expect(channel.ack).toHaveBeenCalledWith(msg);
      expect(channel.nack).not.toHaveBeenCalled();
    });

    it('nacks without requeue when storing fails, so the queue never stalls', async () => {
      mockNotificationsService.send.mockRejectedValue(new Error('db down'));
      const { ctx, channel, msg } = makeCtx();

      await controller.handleMatchCompleted(event, ctx);

      expect(channel.nack).toHaveBeenCalledWith(msg, false, false);
      expect(channel.ack).not.toHaveBeenCalled();
    });
  });

  describe('reading notifications', () => {
    it('returns the caller their own notifications', async () => {
      mockNotificationsService.findByRecipient.mockResolvedValue(['n']);
      await expect(controller.findByRecipient('u-1', 'u-1')).resolves.toEqual(['n']);
    });

    it("refuses to read someone else's notifications", () => {
      expect(() => controller.findByRecipient('victim', 'attacker')).toThrow(ForbiddenException);
      expect(mockNotificationsService.findByRecipient).not.toHaveBeenCalled();
    });

    it('rejects anonymous reads', () => {
      expect(() => controller.findByRecipient('u-1', undefined)).toThrow(UnauthorizedException);
      expect(() => controller.findMine(undefined)).toThrow(UnauthorizedException);
    });

    it('/me uses the identity header', async () => {
      mockNotificationsService.findByRecipient.mockResolvedValue([]);
      await controller.findMine('u-9');
      expect(mockNotificationsService.findByRecipient).toHaveBeenCalledWith('u-9');
    });
  });
});
