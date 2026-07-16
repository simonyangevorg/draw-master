import { Controller, Get, Post, Param, Body, HttpCode } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Controller()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // ── RabbitMQ consumer ─────────────────────────────────────────────────────

  @EventPattern('match.completed')
  handleMatchCompleted(@Payload() event: any) {
    const roundLabel = event.stage === 'GROUP'
      ? `Group Stage`
      : `Round ${event.round}`;

    // Notify winner
    this.notificationsService.send({
      recipientId: event.winnerPlayerId,
      channel: 'in-app',
      subject: 'Match Result',
      body: `You won your ${roundLabel} match in "${event.tournamentName}". Well done!`,
      metadata: { matchId: event.matchId, tournamentId: event.tournamentId },
    });

    // Notify loser
    this.notificationsService.send({
      recipientId: event.loserPlayerId,
      channel: 'in-app',
      subject: 'Match Result',
      body: `Your ${roundLabel} match in "${event.tournamentName}" has been scored.`,
      metadata: { matchId: event.matchId, tournamentId: event.tournamentId },
    });
  }

  // ── HTTP endpoints ────────────────────────────────────────────────────────

  @Get('health')
  health() {
    return { status: 'ok', service: 'notification-service' };
  }

  @Post('notifications/notify')
  @HttpCode(201)
  send(@Body() dto: CreateNotificationDto) {
    return this.notificationsService.send(dto);
  }

  @Get('notifications/:recipientId')
  findByRecipient(@Param('recipientId') recipientId: string) {
    return this.notificationsService.findByRecipient(recipientId);
  }
}
