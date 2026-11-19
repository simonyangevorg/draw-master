import {
  Controller, Get, Post, Patch, Delete,
  Param, ParseUUIDPipe, Body, HttpCode, UseGuards, ValidationPipe, Headers, Query,
} from '@nestjs/common';
import { TournamentsService } from './tournaments.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { EnrollParticipantDto } from './dto/enroll-participant.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { SwapDrawDto } from './dto/swap-draw.dto';
import { AssignSeedDto } from './dto/assign-seed.dto';
import { UpdateDrawSlotDto } from './dto/update-draw-slot.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { OrganiserGuard } from '../auth/organiser.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller()
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  @Get('health')
  health() { return this.tournamentsService.health(); }

  // ── Public reads ──────────────────────────

  // Public, but a signed-in caller also sees their own drafts and entries.
  // X-User-Sub is set (or blanked) by the gateway, never by the client.
  @Get('tournaments')
  findAll(@Headers('x-user-sub') sub?: string, @Query('status') status?: string) {
    return this.tournamentsService.findAll(sub || undefined, status);
  }

  @Get('tournaments/me/participations')
  @UseGuards(JwtGuard)
  getMyParticipations(@CurrentUser() user: any) {
    return this.tournamentsService.getMyParticipations(user.sub);
  }

  @Get('tournaments/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.tournamentsService.findOne(id); }

  @Get('tournaments/:id/participants')
  getParticipants(@Param('id', ParseUUIDPipe) id: string) { return this.tournamentsService.getParticipants(id); }

  @Get('tournaments/:id/draw')
  getDraw(@Param('id', ParseUUIDPipe) id: string) { return this.tournamentsService.getDraw(id); }

  // ── Authenticated writes ──────────────────

  @Post('tournaments')
  @HttpCode(201)
  @UseGuards(JwtGuard, OrganiserGuard)
  create(@Body() dto: CreateTournamentDto, @CurrentUser() user: any) {
    return this.tournamentsService.create(dto, user.sub);
  }

  @Patch('tournaments/:id')
  @UseGuards(JwtGuard)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: UpdateTournamentDto,
    @CurrentUser() user: any,
  ) {
    return this.tournamentsService.update(id, dto, user.sub);
  }

  @Delete('tournaments/:id')
  @HttpCode(204)
  @UseGuards(JwtGuard)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.tournamentsService.remove(id, user.sub);
  }

  @Post('tournaments/:id/open')
  @UseGuards(JwtGuard)
  open(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.tournamentsService.open(id, user.sub);
  }

  // ── Participants ──────────────────────────

  @Post('tournaments/:id/participants')
  @HttpCode(201)
  @UseGuards(JwtGuard)
  enroll(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EnrollParticipantDto, @CurrentUser() user: any) {
    return this.tournamentsService.enroll(id, dto, user.sub);
  }

  @Patch('tournaments/:id/participants/:pid/approve')
  @UseGuards(JwtGuard)
  approveParticipant(@Param('id', ParseUUIDPipe) id: string, @Param('pid', ParseUUIDPipe) pid: string, @CurrentUser() user: any) {
    return this.tournamentsService.approveParticipant(id, pid, user.sub);
  }

  @Patch('tournaments/:id/participants/:pid/reject')
  @UseGuards(JwtGuard)
  rejectParticipant(@Param('id', ParseUUIDPipe) id: string, @Param('pid', ParseUUIDPipe) pid: string, @CurrentUser() user: any) {
    return this.tournamentsService.rejectParticipant(id, pid, user.sub);
  }

  @Patch('tournaments/:id/participants/:pid/withdraw')
  @UseGuards(JwtGuard)
  withdrawParticipant(@Param('id', ParseUUIDPipe) id: string, @Param('pid', ParseUUIDPipe) pid: string, @CurrentUser() user: any) {
    return this.tournamentsService.withdrawParticipant(id, pid, user.sub);
  }

  @Patch('tournaments/:id/participants/:pid/seed')
  @UseGuards(JwtGuard)
  assignSeed(@Param('id', ParseUUIDPipe) id: string, @Param('pid', ParseUUIDPipe) pid: string, @Body() dto: AssignSeedDto, @CurrentUser() user: any) {
    return this.tournamentsService.assignSeed(id, pid, dto.seed, user.sub);
  }

  // ── Draw ─────────────────────────────────

  @Post('tournaments/:id/draw')
  @UseGuards(JwtGuard)
  generateDraw(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.tournamentsService.generateDraw(id, user.sub);
  }

  @Post('tournaments/:id/draw/swap')
  @UseGuards(JwtGuard)
  swapParticipants(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SwapDrawDto, @CurrentUser() user: any) {
    return this.tournamentsService.swapParticipants(id, dto, user.sub);
  }

  @Patch('tournaments/:id/draw/:matchId/slot')
  @UseGuards(JwtGuard)
  updateDrawSlot(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() dto: UpdateDrawSlotDto,
    @CurrentUser() user: any,
  ) {
    return this.tournamentsService.updateDrawSlot(id, matchId, dto.slot, dto.participantId ?? null, user.sub);
  }

  @Patch('tournaments/:id/matches/:matchId')
  @UseGuards(JwtGuard)
  updateMatch(@Param('id', ParseUUIDPipe) id: string, @Param('matchId', ParseUUIDPipe) matchId: string, @Body() dto: UpdateMatchDto, @CurrentUser() user: any) {
    return this.tournamentsService.updateMatch(id, matchId, dto, user.sub);
  }
}
