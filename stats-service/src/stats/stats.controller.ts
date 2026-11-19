import { Controller, Get, Post, Param, Body, HttpCode, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { StatsService } from './stats.service';
import { MatchResultDto } from './dto/match-result.dto';
import { SeedingRequestDto } from './dto/seeding-request.dto';

/** Maps a tournament-service result event onto the stats DTO (player IDs, not participant IDs). */
const toResult = (event: any): MatchResultDto => ({
  matchId: event.matchId,
  player1Id: event.player1Id,
  player2Id: event.player2Id,
  winnerId: event.winnerPlayerId,
  sets: event.sets ?? [],
  surface: (event.surface ?? '').toLowerCase(),
  tournamentId: event.tournamentId,
});

@Controller()
export class StatsController {
  private readonly logger = new Logger(StatsController.name);

  constructor(private readonly statsService: StatsService) {}

  // ── RabbitMQ consumer ─────────────────────────────────────────────────────

  // The queue runs with manual acks (noAck: false, prefetch 1), so every
  // message MUST be acked or nacked, otherwise the channel stalls after the
  // first event and nothing else is ever consumed.
  @EventPattern('match.completed')
  handleMatchCompleted(@Payload() event: any, @Ctx() ctx: RmqContext) {
    return this.consume('match.completed', event, ctx, () => this.statsService.recordResult(toResult(event)));
  }

  // A re-scored match (B-18): reverse what was counted and count the new result.
  @EventPattern('match.corrected')
  handleMatchCorrected(@Payload() event: any, @Ctx() ctx: RmqContext) {
    return this.consume('match.corrected', event, ctx, () => this.statsService.correctResult({
      ...toResult(event),
      previous: event.previous ? toResult(event.previous) : undefined,
    }));
  }

  private async consume(pattern: string, event: any, ctx: RmqContext, work: () => Promise<unknown>) {
    const channel = ctx.getChannelRef();
    const message = ctx.getMessage();
    try {
      await work();
      channel.ack(message);
    } catch (err) {
      // Don't requeue: a poison message would redeliver forever. Log the
      // payload so it can be replayed by hand once the cause is fixed.
      this.logger.error(`${pattern} failed, dropping: ${(err as Error).message} payload=${JSON.stringify(event)}`);
      channel.nack(message, false, false);
    }
  }

  // ── HTTP endpoints ────────────────────────────────────────────────────────

  @Get('health')
  health() {
    return { status: 'ok', service: 'stats-service' };
  }

  @Post('stats/results')
  @HttpCode(201)
  recordResult(@Body() dto: MatchResultDto) {
    return this.statsService.recordResult(dto);
  }

  @Get('stats/players/:playerId/stats')
  getPlayerStats(@Param('playerId') playerId: string) {
    return this.statsService.getPlayerStats(playerId);
  }

  @Get('stats/players/:playerId/h2h/:opponentId')
  getH2H(
    @Param('playerId') playerId: string,
    @Param('opponentId') opponentId: string,
  ) {
    return this.statsService.getH2HRecord(playerId, opponentId);
  }

  @Post('stats/seedings')
  computeSeedings(@Body() dto: SeedingRequestDto) {
    return this.statsService.computeSeedings(dto);
  }

  @Get('stats/tournaments/:tournamentId/report')
  getTournamentReport(@Param('tournamentId') tournamentId: string) {
    return this.statsService.getTournamentReport(tournamentId);
  }
}
