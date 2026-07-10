import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationEntity } from './entities/notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationsRepo: Repository<NotificationEntity>,
  ) {}

  send(dto: CreateNotificationDto): Promise<NotificationEntity> {
    const record = this.notificationsRepo.create({
      status: 'sent',
      ...dto,
    });
    // TODO: integrate with SendGrid / Twilio / FCM
    return this.notificationsRepo.save(record);
  }

  findByRecipient(recipientId: string): Promise<NotificationEntity[]> {
    return this.notificationsRepo.find({ where: { recipientId } });
  }
}
