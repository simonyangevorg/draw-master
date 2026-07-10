import { IsString, IsOptional, IsObject } from 'class-validator';

export class CreateNotificationDto {
  @IsString()
  recipientId: string;

  @IsString()
  channel: string; // email | sms | push

  @IsString()
  subject: string;

  @IsString()
  body: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
