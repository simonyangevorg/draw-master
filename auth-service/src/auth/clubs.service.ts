import {
  BadRequestException, ConflictException, Inject, Injectable, NotFoundException, OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { ILike, In, Repository } from 'typeorm';
import { ClubEntity } from './entities/club.entity';
import { ClubMembershipEntity } from './entities/club-membership.entity';
import { UserEntity } from './entities/user.entity';
import { AppointAdminDto, CreateClubDto, UpdateClubDto } from './dto/club.dto';
import { AuditLogger } from './audit-logger.service';

/** "Winter Club  Open!" → "winter-club-open" */
export const slugify = (name: string) =>
  name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'club';

/**
 * Clubs and their admins (L-03). Every write is the super-admin's; the
 * controller enforces that. Club changes are announced as club.upserted so
 * tournament-service can label and hide tournaments without calling us.
 */
@Injectable()
export class ClubsService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(ClubEntity) private readonly clubsRepo: Repository<ClubEntity>,
    @InjectRepository(ClubMembershipEntity) private readonly membershipsRepo: Repository<ClubMembershipEntity>,
    @InjectRepository(UserEntity) private readonly usersRepo: Repository<UserEntity>,
    @Inject('TOURNAMENTS_CLIENT') private readonly tournamentsClient: ClientProxy,
    private readonly auditLogger: AuditLogger,
  ) {}

  /** Re-announce every club on boot, so a missed event never leaves tournament-service stale. */
  async onApplicationBootstrap() {
    for (const club of await this.clubsRepo.find()) this.announce(club);
  }

  /** The public directory: active clubs only. */
  directory() {
    return this.clubsRepo.find({
      where: { status: 'ACTIVE' },
      order: { name: 'ASC' },
      select: ['id', 'name', 'slug', 'city', 'country', 'logoUrl'],
    });
  }

  /** Every club, with how many admins each has (super-admin list). */
  async listAll() {
    const clubs = await this.clubsRepo.find({ order: { name: 'ASC' } });
    const admins = clubs.length
      ? await this.membershipsRepo.find({ where: { clubId: In(clubs.map((c) => c.id)), role: 'ADMIN', status: 'ACTIVE' } })
      : [];
    return clubs.map((c) => ({ ...c, adminCount: admins.filter((a) => a.clubId === c.id).length }));
  }

  async get(id: string) {
    const club = await this.clubsRepo.findOne({ where: { id } });
    if (!club) throw new NotFoundException('Club not found');
    return { ...club, admins: await this.adminsOf(id) };
  }

  async create(dto: CreateClubDto, actorId: string) {
    await this.assertNameFree(dto.name);
    const club = await this.clubsRepo.save(this.clubsRepo.create({
      name: dto.name,
      slug: await this.freeSlug(dto.name),
      city: dto.city ?? null,
      country: dto.country ?? null,
      contactEmail: dto.contactEmail ?? null,
      logoUrl: dto.logoUrl ?? null,
      status: 'ACTIVE',
      createdBy: actorId,
    }));
    this.auditLogger.record({ actorId, action: 'CLUB_CREATED', targetId: club.id, name: club.name });
    this.announce(club);
    return { ...club, admins: [] };
  }

  async update(id: string, dto: UpdateClubDto, actorId: string) {
    const club = await this.clubsRepo.findOne({ where: { id } });
    if (!club) throw new NotFoundException('Club not found');
    if (dto.name && dto.name.toLowerCase() !== club.name.toLowerCase()) await this.assertNameFree(dto.name);
    const before = club.status;
    for (const [k, v] of Object.entries(dto)) if (v !== undefined) (club as any)[k] = v;
    const saved = await this.clubsRepo.save(club);
    this.auditLogger.record({
      actorId, action: before !== saved.status ? `CLUB_${saved.status === 'ACTIVE' ? 'REACTIVATED' : 'DEACTIVATED'}` : 'CLUB_UPDATED',
      targetId: id,
    });
    this.announce(saved);
    return { ...saved, admins: await this.adminsOf(id) };
  }

  /**
   * Make a user an admin of the club (creating their membership if needed).
   * Takes effect in their token at their next refresh.
   */
  async appointAdmin(clubId: string, dto: AppointAdminDto, actorId: string) {
    const club = await this.clubsRepo.findOne({ where: { id: clubId } });
    if (!club) throw new NotFoundException('Club not found');
    const user = await this.usersRepo.findOne({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('User not found');
    const membership = (await this.membershipsRepo.findOne({ where: { clubId, userId: user.id } }))
      ?? this.membershipsRepo.create({ clubId, userId: user.id });
    if (membership.role === 'ADMIN' && membership.status === 'ACTIVE') {
      throw new ConflictException(`${user.name} is already an admin of ${club.name}`);
    }
    membership.role = 'ADMIN';
    membership.status = 'ACTIVE';
    membership.decidedBy = actorId;
    membership.decidedAt = new Date();
    await this.membershipsRepo.save(membership);
    this.auditLogger.record({ actorId, action: 'CLUB_ADMIN_APPOINTED', targetId: user.id, clubId });
    return this.adminsOf(clubId);
  }

  /**
   * Remove someone's admin seat; they stay a member. A club always keeps at
   * least one admin unless the super-admin confirms with force (L-03).
   */
  async removeAdmin(clubId: string, userId: string, force: boolean, actorId: string) {
    const membership = await this.membershipsRepo.findOne({ where: { clubId, userId, role: 'ADMIN', status: 'ACTIVE' } });
    if (!membership) throw new NotFoundException('That user is not an admin of this club');
    const admins = await this.membershipsRepo.count({ where: { clubId, role: 'ADMIN', status: 'ACTIVE' } });
    if (admins <= 1 && !force) {
      throw new BadRequestException(
        'This is the club\'s last admin. Appoint another admin first, or confirm to leave the club with none.');
    }
    membership.role = 'MEMBER';
    membership.decidedBy = actorId;
    membership.decidedAt = new Date();
    await this.membershipsRepo.save(membership);
    this.auditLogger.record({ actorId, action: 'CLUB_ADMIN_REMOVED', targetId: userId, clubId, leftWithoutAdmin: admins <= 1 });
    return this.adminsOf(clubId);
  }

  /** User search for appointing admins: name or email contains the text. */
  async searchUsers(text: string) {
    const q = (text ?? '').trim();
    if (q.length < 2) return [];
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    return this.usersRepo.find({
      where: [{ name: ILike(like) }, { email: ILike(like) }],
      select: ['id', 'name', 'email', 'role'],
      order: { name: 'ASC' },
      take: 20,
    });
  }

  private async adminsOf(clubId: string) {
    const rows = await this.membershipsRepo.find({ where: { clubId, role: 'ADMIN', status: 'ACTIVE' } });
    if (!rows.length) return [];
    const users = await this.usersRepo.find({ where: { id: In(rows.map((r) => r.userId)) }, select: ['id', 'name', 'email'] });
    return users.map((u) => ({ userId: u.id, name: u.name, email: u.email })).sort((a, b) => a.name.localeCompare(b.name));
  }

  private async assertNameFree(name: string) {
    if (await this.clubsRepo.findOne({ where: { name: ILike(name.replace(/[%_\\]/g, (c) => `\\${c}`)) } })) {
      throw new ConflictException(`A club called "${name}" already exists`);
    }
  }

  private async freeSlug(name: string) {
    const base = slugify(name);
    let slug = base;
    for (let i = 2; await this.clubsRepo.findOne({ where: { slug } }); i++) slug = `${base}-${i}`;
    return slug;
  }

  /** Fire-and-forget, like every event here: a broker outage never blocks the write. */
  private announce(club: ClubEntity) {
    try {
      this.tournamentsClient
        .emit('club.upserted', { id: club.id, name: club.name, slug: club.slug, status: club.status })
        .subscribe({ error: () => undefined });
    } catch {
      /* broker unavailable: tournament-service catches up on the next change */
    }
  }
}
