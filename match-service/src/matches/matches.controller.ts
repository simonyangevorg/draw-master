import {
  Controller, Get, Post, Patch,
  Param, ParseUUIDPipe, Body, Query, HttpCode,
} from '@nestjs/common';
import { MatchesService } from './matches.service';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateScoreDto } from './dto/update-score.dto';

@Controller()
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'match-service' };
  }

  @Get('matches')
  findAll(@Query('tournamentId') tournamentId?: string) {
    return this.matchesService.findAll(tournamentId);
  }

  @Post('matches')
  @HttpCode(201)
  create(@Body() dto: CreateMatchDto) {
    return this.matchesService.create(dto);
  }

  @Get('matches/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.matchesService.findOne(id);
  }

  @Patch('matches/:id/score')
  updateScore(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateScoreDto) {
    return this.matchesService.updateScore(id, dto);
  }
}
