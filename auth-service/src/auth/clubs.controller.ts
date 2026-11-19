import {
  Body, Controller, Get, HttpCode, Param, ParseBoolPipe, ParseUUIDPipe, Patch, Post, Delete, Query, Req, UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ClubsService } from './clubs.service';
import { JwtGuard } from './jwt.guard';
import { SuperAdminGuard } from './super-admin.guard';
import { AppointAdminDto, CreateClubDto, UpdateClubDto } from './dto/club.dto';

/** Reached through the gateway as /api/auth/clubs and /api/auth/admin/... */
@Controller('auth')
export class ClubsController {
  constructor(private readonly clubs: ClubsService) {}

  /** Public directory of active clubs, for players choosing a club to join. */
  @Get('clubs')
  directory() {
    return this.clubs.directory();
  }

  // ── Super-admin only (L-03) ───────────────────────────────────────────────

  @Get('admin/clubs')
  @UseGuards(JwtGuard, SuperAdminGuard)
  listAll() {
    return this.clubs.listAll();
  }

  @Get('admin/clubs/:id')
  @UseGuards(JwtGuard, SuperAdminGuard)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.clubs.get(id);
  }

  @Post('admin/clubs')
  @HttpCode(201)
  @UseGuards(JwtGuard, SuperAdminGuard)
  create(@Body() dto: CreateClubDto, @Req() req: Request) {
    return this.clubs.create(dto, req['user'].sub);
  }

  @Patch('admin/clubs/:id')
  @UseGuards(JwtGuard, SuperAdminGuard)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClubDto, @Req() req: Request) {
    return this.clubs.update(id, dto, req['user'].sub);
  }

  @Post('admin/clubs/:id/admins')
  @HttpCode(201)
  @UseGuards(JwtGuard, SuperAdminGuard)
  appointAdmin(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AppointAdminDto, @Req() req: Request) {
    return this.clubs.appointAdmin(id, dto, req['user'].sub);
  }

  @Delete('admin/clubs/:id/admins/:userId')
  @UseGuards(JwtGuard, SuperAdminGuard)
  removeAdmin(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('force', new ParseBoolPipe({ optional: true })) force: boolean | undefined,
    @Req() req: Request,
  ) {
    return this.clubs.removeAdmin(id, userId, force === true, req['user'].sub);
  }

  @Get('admin/users')
  @UseGuards(JwtGuard, SuperAdminGuard)
  searchUsers(@Query('search') search: string) {
    return this.clubs.searchUsers(search);
  }
}
