import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, HttpCode,
} from '@nestjs/common';
import { PlayersService } from './players.service';
import { CreatePlayerDto } from './dto/create-player.dto';
import { UpdatePlayerDto } from './dto/update-player.dto';

@Controller()
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'player-service' };
  }

  @Get('players')
  findAll() {
    return this.playersService.findAll();
  }

  @Post('players')
  @HttpCode(201)
  create(@Body() dto: CreatePlayerDto) {
    return this.playersService.create(dto);
  }

  @Get('players/:id')
  findOne(@Param('id') id: string) {
    return this.playersService.findOne(id);
  }

  @Patch('players/:id')
  update(@Param('id') id: string, @Body() dto: UpdatePlayerDto) {
    return this.playersService.update(id, dto);
  }

  @Delete('players/:id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    this.playersService.remove(id);
  }
}
