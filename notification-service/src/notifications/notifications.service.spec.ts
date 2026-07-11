import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { NotificationEntity } from './entities/notification.entity';

describe('NotificationsService', () => {
  let service: NotificationsService;

  const mockRepo = {
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(NotificationEntity), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  describe('send', () => {
    it('creates a notification with status sent', async () => {
      mockRepo.create.mockImplementation((data) => data);
      mockRepo.save.mockImplementation(async (n) => ({ id: 'notif-1', ...n }));

      const result = await service.send({
        recipientId: 'player-1', channel: 'in-app', subject: 'Match Result', body: 'You won!',
      });

      expect(result.status).toBe('sent');
      expect(result.recipientId).toBe('player-1');
    });
  });

  describe('findByRecipient', () => {
    it('returns only notifications for the given recipient', async () => {
      mockRepo.find.mockResolvedValue([
        { id: 'n1', recipientId: 'player-1', channel: 'in-app', subject: 'A', body: 'B' },
      ]);

      const result = await service.findByRecipient('player-1');

      expect(mockRepo.find).toHaveBeenCalledWith({ where: { recipientId: 'player-1' } });
      expect(result).toHaveLength(1);
    });

    it('returns an empty array when the recipient has no notifications', async () => {
      mockRepo.find.mockResolvedValue([]);

      const result = await service.findByRecipient('nobody');

      expect(result).toEqual([]);
    });
  });
});
