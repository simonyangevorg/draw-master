import {
  Controller, Get, Post, Patch, Delete, Logger,
  Param, ParseUUIDPipe, Body, HttpCode, UseGuards, ValidationPipe, Query,
} from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { TournamentsService } from './tournaments.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { EnrollParticipantDto } from './dto/enroll-participant.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { SwapDrawDto } from './dto/swap-draw.dto';
import { AssignSeedDto } from './dto/assign-seed.dto';
import { UpdateDrawSlotDto } from './dto/update-draw-slot.dto';
import { CreateEventDto, EventRefDto, UpdateEventDto } from './dto/event.dto';
import { CreatePresetDto, UpdatePresetDto } from './dto/rules.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, OptionalUser } from '../auth/current-user.decorator';

/**
 * Every route hands the caller to the service, which applies the L-06 access
 * rules (access.ts). Reads are open to anonymous callers but filtered; writes
 * need a signed-in caller (JwtGuard) and then the right club seat.
 */
@Controller()
export class TournamentsController {
  private readonly logger = new Logger(TournamentsController.name);

  constructor(private readonly tournamentsService: TournamentsService) {}

  @Get('health')
  health() { return this.tournamentsService.health(); }

  // ── Events from other services ───────────
  // tournaments_queue runs with manual acks (see main.ts).

  @EventPattern('club.upserted')
  async onClubUpserted(@Payload() event: any, @Ctx() ctx: RmqContext) {
    const channel = ctx.getChannelRef();
    const message = ctx.getMessage();
    try {
      await this.tournamentsService.upsertClub(event);
      channel.ack(message);
    } catch (err) {
      this.logger.error(`club.upserted failed, dropping: ${(err as Error).message} payload=${JSON.stringify(event)}`);
      channel.nack(message, false, false);
    }
  }

  // ── Reads (filtered for the caller) ──────

  @Get('tournaments')
  findAll(@OptionalUser() user: CurrentUser | null, @Query('status') status?: string) {
    return this.tournamentsService.findAll(user, status);
  }

  @Get('tournaments/me/participations')
  @UseGuards(JwtGuard)
  getMyParticipations(@CurrentUser() user: CurrentUser) {
    return this.tournamentsService.getMyParticipations(user.sub);
  }

  // ── Match rule presets (F-05) ────────────
  // Declared before tournaments/:id so "rule-presets" isn't taken for an id.

  /** Built-in presets, plus ?clubId=...'s own for its members. */
  @Get('tournaments/rule-presets')
  @UseGuards(JwtGuard)
  listPresets(@CurrentUser() user: CurrentUser, @Query('clubId') clubId?: string) {
    return this.tournamentsService.listPresets(user, clubId || undefined);
  }

  @Post('tournaments/rule-presets')
  @HttpCode(201)
  @UseGuards(JwtGuard)
  createPreset(@Body() dto: CreatePresetDto, @CurrentUser() user: CurrentUser) {
    return this.tournamentsService.createPreset(dto, user);
  }

  @Patch('tournaments/rule-presets/:pid')
  @UseGuards(JwtGuard)
  updatePreset(@Param('pid', ParseUUIDPipe) pid: string, @Body() dto: UpdatePresetDto, @CurrentUser() user: CurrentUser) {
    return this.tournamentsService.updatePreset(pid, dto, user);
  }

  @Delete('tournaments/rule-presets/:pid')
  @HttpCode(204)
  @UseGuards(JwtGuard)
  deletePreset(@Param('pid', ParseUUIDPipe) pid: string, @CurrentUser() user: CurrentUser) {
    return this.tournamentsService.deletePreset(pid, user);
  }

  @Get('tournaments/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @OptionalUser() user: CurrentUser | null) {
    return this.tournamentsService.findOne(id, user);
  }

  @Get('tournaments/:id/participants')
  getParticipants(@Param('id', ParseUUIDPipe) id: string, @OptionalUser() user: CurrentUser | null) {
    return this.tournamentsService.getParticipants(id, user);
  }

  /** The whole tournament's draw; each match carries its eventId. */
  @Get('tournaments/:id/draw')
  getDraw(@Param('id', ParseUUIDPipe) id: string, @OptionalUser() user: CurrentUser | null) {
    return this.tournamentsService.getDraw(id, user);
  }

  @Get('tournaments/:id/events/:eid/standings')
  getStandings(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('eid', ParseUUIDPipe) eid: string,
    @OptionalUser() user: CurrentUser | null,
  ) {
    return this.tournamentsService.getStandings(id, eid, user);
  }

  @Get('tournaments/:id/events/:eid/draw')
  getEventDraw(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('eid', ParseUUIDPipe) eid: string,
    @OptionalUser() user: CurrentUser | null,
  ) {
    return this.tournamentsService.getDraw(id, user, eid);
  }

  // ── Writes ───────────────────────────────

  @Post('tournaments')
  @HttpCode(201)
  @UseGuards(JwtGuard)
  create(@Body() dto: CreateTournamentDto, @CurrentUser() user: CurrentUser) {
    return this.tournamentsService.create(dto, user);
  }

  @Patch('tournaments/:id')
  @UseGuards(JwtGuard)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: UpdateTournamentDto,
    @CurrentUser() user: CurrentUser,
  ) {
    return this.tournamentsService.update(id, dto, user);
  }

  @Delete('tournaments/:id')
  @HttpCode(204)
  @UseGuards(JwtGuard)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUser) {
    return this.tournamentsService.remove(id, user);
  }

  @Post('tournaments/:id/open')
  @UseGuards(JwtGuard)
  open(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUser) {
    return this.tournamentsService.open(id, user);
  }

  // ── Events (F-01) ────────────────────────

  @Post('tournaments/:id/events')
  @HttpCode(201)
  @UseGuards(JwtGuard)
  addEvent(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateEventDto, @CurrentUser() user: CurrentUser) {
    return this.tournamentsService.addEvent(id, dto, user);
  }

  @Patch('tournaments/:id/events/:eid')
  @UseGuards(JwtGuard)
  updateEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('eid', ParseUUIDPipe) eid: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) dto: UpdateEventDto,
    @CurrentUser() user: CurrentUser,
  ) {
    return this.tournamentsService.updateEvent(id, eid, dto, user);
  }

  @Delete('tournaments/:id/events/:eid')
  @HttpCode(204)
  @UseGuards(JwtGuard)
  removeEvent(@Param('id', ParseUUIDPipe) id: string, @Param('eid', ParseUUIDPipe) eid: string, @CurrentUser() user: CurrentUser) {
    return this.tournamentsService.removeEvent(id, eid, user);
  }

  @Post('tournaments/:id/events/:eid/participants')
  @HttpCode(201)
  @UseGuards(JwtGuard)
  enrollInEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('eid', ParseUUIDPipe) eid: string,
    @Body() dto: EnrollParticipantDto,
    @CurrentUser() user: CurrentUser,
  ) {
    return this.tournamentsService.enroll(id, { ...dto, eventId: eid }, user);
  }

  @Post('tournaments/:id/events/:eid/draw')
  @UseGuards(JwtGuard)
  generateEventDraw(@Param('id', ParseUUIDPipe) id: string, @Param('eid', ParseUUIDPipe) eid: string, @CurrentUser() user: CurrentUser) {
    return this.tournamentsService.generateDraw(id, user, eid);
  }

  // ── Participants ─────────────────────────
  // (POST /tournaments/:id/participants takes eventId in the body, or none
  // while the tournament has one event: the pre-F-01 route, kept as an alias.)

  @Post('tournaments/:id/participants')
  @HttpCode(201)
  @UseGuards(JwtGuard)
  enroll(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EnrollParticipantDto, @CurrentUser() user: CurrentUser) {
    return this.tournamentsService.enroll(id, dto, user);
  }

  @Patch('tournaments/:id/participants/:pid/approve')
  @UseGuards(JwtGuard)
  approveParticipant(@Param('id', ParseUUIDPipe) id: string, @Param('pid', ParseUUIDPipe) pid: string, @CurrentUser() user: CurrentUser) {
    return this.tournamentsService.approveParticipant(id, pid, user);
  }

  @Patch('tournaments/:id/participants/:pid/reject')
  @UseGuards(JwtGuard)
  rejectParticipant(@Param('id', ParseUUIDPipe) id: string, @Param('pid', ParseUUIDPipe) pid: string, @CurrentUser() user: CurrentUser) {
    return this.tournamentsService.rejectParticipant(id, pid, user);
  }

  @Patch('tournaments/:id/participants/:pid/withdraw')
  @UseGuards(JwtGuard)
  withdrawParticipant(@Param('id', ParseUUIDPipe) id: string, @Param('pid', ParseUUIDPipe) pid: string, @CurrentUser() user: CurrentUser) {
    return this.tournamentsService.withdrawParticipant(id, pid, user);
  }

  @Patch('tournaments/:id/participants/:pid/seed')
  @UseGuards(JwtGuard)
  assignSeed(@Param('id', ParseUUIDPipe) id: string, @Param('pid', ParseUUIDPipe) pid: string, @Body() dto: AssignSeedDto, @CurrentUser() user: CurrentUser) {
    return this.tournamentsService.assignSeed(id, pid, dto.seed, user);
  }

  // ── Draw ─────────────────────────────────

  @Post('tournaments/:id/draw')
  @UseGuards(JwtGuard)
  generateDraw(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EventRefDto, @CurrentUser() user: CurrentUser) {
    return this.tournamentsService.generateDraw(id, user, dto?.eventId);
  }

  @Post('tournaments/:id/draw/swap')
  @UseGuards(JwtGuard)
  swapParticipants(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SwapDrawDto, @CurrentUser() user: CurrentUser) {
    return this.tournamentsService.swapParticipants(id, dto, user);
  }

  @Patch('tournaments/:id/draw/:matchId/slot')
  @UseGuards(JwtGuard)
  updateDrawSlot(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() dto: UpdateDrawSlotDto,
    @CurrentUser() user: CurrentUser,
  ) {
    return this.tournamentsService.updateDrawSlot(id, matchId, dto.slot, dto.participantId ?? null, user);
  }

  @Patch('tournaments/:id/matches/:matchId')
  @UseGuards(JwtGuard)
  updateMatch(@Param('id', ParseUUIDPipe) id: string, @Param('matchId', ParseUUIDPipe) matchId: string, @Body() dto: UpdateMatchDto, @CurrentUser() user: CurrentUser) {
    return this.tournamentsService.updateMatch(id, matchId, dto, user);
  }
}
