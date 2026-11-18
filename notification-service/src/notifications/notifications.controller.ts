import {
  Controller, Get, Post, Param, Body, HttpCode, Headers, Logger,
  ForbiddenException, UnauthorizedException,
} from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Controller()
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  // ── RabbitMQ consumer ─────────────────────────────────────────────────────

  // Manual-ack queue (noAck: false, prefetch 1): every message must be acked
  // or nacked, otherwise the channel stalls after the first event.
  @EventPattern('match.completed')
  async handleMatchCompleted(@Payload() event: any, @Ctx() ctx: RmqContext) {
    const channel = ctx.getChannelRef();
    const message = ctx.getMessage();
    try {
      await this.notifyMatchCompleted(event);
      channel.ack(message);
    } catch (err) {
      // No requeue: a poison message would redeliver forever. The payload is
      // logged so it can be replayed by hand.
      this.logger.error(
        `match.completed failed, dropping: ${(err as Error).message} payload=${JSON.stringify(event)}`,
      );
      channel.nack(message, false, false);
    }
  }

  async notifyMatchCompleted(event: any) {
    const roundLabel = event.stage === 'GROUP'
      ? `Group Stage`
      : `Round ${event.round}`;

    await this.notificationsService.send({
      recipientId: event.winnerPlayerId,
      channel: 'in-app',
      subject: 'Match Result',
      body: `You won your ${roundLabel} match in "${event.tournamentName}". Well done!`,
      metadata: { matchId: event.matchId, tournamentId: event.tournamentId },
    });

    await this.notificationsService.send({
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

  // Internal only: the gateway returns 403 for this path, so it is reachable
  // solely from inside the Docker network.
  @Post('notifications/notify')
  @HttpCode(201)
  send(@Body() dto: CreateNotificationDto) {
    return this.notificationsService.send(dto);
  }

  // The caller's own notifications. Identity comes from the gateway's
  // X-User-Sub header, never from the URL.
  @Get('notifications/me')
  findMine(@Headers('x-user-sub') userSub?: string) {
    if (!userSub) throw new UnauthorizedException();
    return this.notificationsService.findByRecipient(userSub);
  }

  @Get('notifications/:recipientId')
  findByRecipient(
    @Param('recipientId') recipientId: string,
    @Headers('x-user-sub') userSub?: string,
  ) {
    if (!userSub) throw new UnauthorizedException();
    if (userSub !== recipientId) throw new ForbiddenException();
    return this.notificationsService.findByRecipient(recipientId);
  }
}
