import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { CreateNotificationDto } from './dto/create-notification.dto';

export interface Notification {
  id: string;
  sentAt: string;
  status: 'sent';
  recipientId: string;
  channel: string;
  subject: string;
  body: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  private readonly notifications: Notification[] = [];

  send(dto: CreateNotificationDto): Notification {
    const record: Notification = {
      id: uuidv4(),
      sentAt: new Date().toISOString(),
      status: 'sent',
      ...dto,
    };
    this.notifications.push(record);
    // TODO: integrate with SendGrid / Twilio / FCM
    return record;
  }

  findByRecipient(recipientId: string): Notification[] {
    return this.notifications.filter(n => n.recipientId === recipientId);
  }
}
