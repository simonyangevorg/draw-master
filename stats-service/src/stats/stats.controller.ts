import { Controller, Get, Post, Param, Body, HttpCode } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { StatsService } from './stats.service';
import { MatchResultDto } from './dto/match-result.dto';
import { SeedingRequestDto } from './dto/seeding-request.dto';

@Controller()
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  // ── RabbitMQ consumer ─────────────────────────────────────────────────────

  @EventPattern('match.completed')
  handleMatchCompleted(@Payload() event: any) {
    this.statsService.recordResult({
      matchId: event.matchId,
      player1Id: event.player1Id,
      player2Id: event.player2Id,
      winnerId: event.winnerPlayerId,
      sets: event.sets,
      surface: (event.surface ?? '').toLowerCase(),
      tournamentId: event.tournamentId,
    });
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
