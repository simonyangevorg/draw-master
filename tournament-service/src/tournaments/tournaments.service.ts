import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException, Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { v4 as uuidv4 } from 'uuid';
import { TournamentEntity } from './entities/tournament.entity';
import { ParticipantEntity } from './entities/participant.entity';
import { TournamentMatchEntity } from './entities/match.entity';
import { TournamentGroupEntity } from './entities/group.entity';
import { CreateTournamentDto, SUPPORTED_FORMATS } from './dto/create-tournament.dto';
import { today } from './dto/validators';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { CreateEventDto, UpdateEventDto, EVENT_FORMAT_FIELDS, EVENT_RULE_FIELDS } from './dto/event.dto';
import { CreatePresetDto, UpdatePresetDto } from './dto/rules.dto';
import { RulePresetEntity } from './entities/rule-preset.entity';
import { DEFAULT_RULES, RuleSet, legacyRules, normaliseRules, ruleProblems, rulesFor, rulesStageOf } from './rules';
import { Outcome, SetScore, validateScore } from './score';
import { TYPE_TO_EVENT } from './dto/formats';
import { EventEntity } from './entities/event.entity';
import { EnrollParticipantDto } from './dto/enroll-participant.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { SwapDrawDto } from './dto/swap-draw.dto';
import { AuditLogger } from '../audit/audit-logger.service';
import { ClubRefEntity } from './entities/club-ref.entity';
import { Actor, canEnter, canManage, canRead, isSuperAdmin, isClubAdmin, isClubMember } from './access';

const GROUP_LETTERS = 'ABCDEFGH';

@Injectable()
export class TournamentsService {
  constructor(
    @InjectRepository(TournamentEntity)
    private readonly tournamentsRepo: Repository<TournamentEntity>,
    @InjectRepository(ParticipantEntity)
    private readonly participantsRepo: Repository<ParticipantEntity>,
    @InjectRepository(TournamentMatchEntity)
    private readonly matchesRepo: Repository<TournamentMatchEntity>,
    @InjectRepository(TournamentGroupEntity)
    private readonly groupsRepo: Repository<TournamentGroupEntity>,
    @InjectRepository(ClubRefEntity)
    private readonly clubsRepo: Repository<ClubRefEntity>,
    @InjectRepository(EventEntity)
    private readonly eventsRepo: Repository<EventEntity>,
    @InjectRepository(RulePresetEntity)
    private readonly presetsRepo: Repository<RulePresetEntity>,
    @Inject('STATS_CLIENT')
    private readonly statsClient: ClientProxy,
    @Inject('NOTIFICATIONS_CLIENT')
    private readonly notificationsClient: ClientProxy,
    private readonly auditLogger: AuditLogger,
    private readonly dataSource: DataSource,
  ) {}

  // ── CRUD ──────────────────────────────────

  /**
   * The tournament list, filtered for whoever is asking (L-06, replacing the
   * B-21 interim rules):
   * - managers (super-admin, the club's admins) see all their tournaments;
   * - everyone else sees what canRead allows: no DRAFTs, no tournaments of an
   *   INACTIVE club, CLUB tournaments only for members or entrants;
   * - COMPLETED and CANCELLED ones are left out unless the caller manages or
   *   entered them, or ?status= asks for them.
   * `status` is a comma-separated list of statuses to restrict to.
   * Each row says what the caller may do with it (`access`).
   */
  async findAll(actor?: Actor | null, status?: string) {
    const all = await this.tournamentsRepo.find({ order: { createdAt: 'DESC' }, relations: ['events'] });
    const wanted = status
      ? new Set(status.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))
      : null;
    const entered = actor
      ? new Set((await this.participantsRepo.find({ where: { playerId: actor.sub } })).map((p) => p.tournamentId))
      : new Set<string>();
    const clubs = new Map((await this.clubsRepo.find()).map((c) => [c.id, c]));
    return all
      .filter((t) => {
        const manager = canManage(actor, t);
        const involved = manager || entered.has(t.id);
        if (wanted) {
          if (!wanted.has(t.status)) return false;
        } else if (!involved && (t.status === 'COMPLETED' || t.status === 'CANCELLED')) {
          return false;
        }
        return canRead(actor, t, { entered: entered.has(t.id), clubActive: clubs.get(t.clubId)?.status !== 'INACTIVE' });
      })
      .map((t) => this.present(t, actor, clubs.get(t.clubId)));
  }

  /** One tournament, if the caller may see it (404 otherwise, so drafts don't leak). */
  async findOne(id: string, actor?: Actor | null) {
    const t = await this.load(id);
    const club = t.clubId ? await this.clubsRepo.findOne({ where: { id: t.clubId } }) : null;
    const entered = !!actor && (t.participants ?? []).some((p) => p.playerId === actor.sub);
    if (!canRead(actor, t, { entered, clubActive: club?.status !== 'INACTIVE' })) {
      throw new NotFoundException('Tournament not found');
    }
    return this.present(t, actor, club);
  }

  /** Read-checked participants and draw, for the public GET routes. */
  async getParticipants(tournamentId: string, actor?: Actor | null) {
    return (await this.findOne(tournamentId, actor)).participants;
  }

  async getDraw(tournamentId: string, actor?: Actor | null, eventId?: string) {
    const t = await this.findOne(tournamentId, actor);
    const where = eventId ? { tournamentId, eventId: this.eventOf(t, eventId).id } : { tournamentId };
    const matches = await this.matchesRepo.find({ where, order: { round: 'ASC', position: 'ASC' } });
    return this.withRules(t, matches);
  }

  /** Adds each match's rules and rule stage (GROUP, KNOCKOUT or FINAL), from its event (F-05). */
  private withRules(t: TournamentEntity, matches: TournamentMatchEntity[]) {
    const events = new Map((t.events ?? []).map((e) => [e.id, e]));
    return matches.map((m) => {
      const ev = events.get(m.eventId);
      return ev ? Object.assign(m, { rulesStage: rulesStageOf(ev, m), rules: rulesFor(ev, m) }) : m;
    });
  }

  /** Adds the club's name and what this caller may do; the UI reads `access`, never ids. */
  private present(t: TournamentEntity, actor: Actor | null | undefined, club?: ClubRefEntity | null) {
    const clubActive = club?.status !== 'INACTIVE';
    return Object.assign(t, {
      club: club ? { id: club.id, name: club.name, slug: club.slug } : null,
      access: { canManage: canManage(actor, t), canEnter: canEnter(actor, t, { clubActive }) },
    });
  }

  /**
   * Creating needs an active club the caller is an admin of (the super-admin
   * may create for any club). Visibility defaults to CLUB (L-06).
   */
  async create(dto: CreateTournamentDto, actor: Actor): Promise<TournamentEntity> {
    if (!dto.clubId) throw new BadRequestException('Choose the club this tournament belongs to');
    if (!isSuperAdmin(actor) && !isClubAdmin(actor, dto.clubId)) {
      throw new ForbiddenException('Only an admin of this club can create its tournaments');
    }
    const club = await this.clubsRepo.findOne({ where: { id: dto.clubId } });
    if (!club) throw new BadRequestException('Unknown club');
    if (club.status === 'INACTIVE') throw new BadRequestException(`${club.name} is not active`);
    const { events: eventDtos, ...fields } = dto as any;
    const events = this.eventsFrom(dto);
    // Only the tournament's own fields go on the tournament; the rest is per event.
    for (const k of ['tournamentType', 'drawFormat', ...EVENT_FORMAT_FIELDS, ...EVENT_RULE_FIELDS]) delete fields[k];
    const t = this.tournamentsRepo.create({
      ...fields,
      createdBy: actor.sub,
      status: 'DRAFT',
      ageGroup: (dto.ageGroup ?? 'OPEN') as any,
      visibility: dto.visibility ?? 'CLUB',
      requiresApproval: dto.requiresApproval ?? false,
      events: events.map((e, i) => this.eventsRepo.create({ ...e, position: i, status: 'DRAFT' })),
    } as any) as unknown as TournamentEntity;
    const saved = await this.tournamentsRepo.save(t);
    this.auditLogger.record({ actorId: actor.sub, action: 'TOURNAMENT_CREATED', targetId: saved.id, clubId: dto.clubId });
    return this.present(saved, actor, club);
  }

  /**
   * The events a create request asks for (F-01): the events[] list, or for an
   * older client one event built from tournamentType + drawFormat.
   */
  private eventsFrom(dto: CreateTournamentDto): Partial<EventEntity>[] {
    const list: CreateEventDto[] = dto.events?.length ? dto.events : (() => {
      if (!dto.drawFormat || !dto.tournamentType) {
        throw new BadRequestException('Add at least one event (for example Men\'s Singles)');
      }
      const legacy = dto as any;
      const pick = (k: string) => (legacy[k] !== undefined ? { [k]: legacy[k] } : {});
      return [{
        name: TYPE_TO_EVENT[dto.tournamentType].name,
        category: TYPE_TO_EVENT[dto.tournamentType].category,
        discipline: TYPE_TO_EVENT[dto.tournamentType].discipline,
        drawFormat: dto.drawFormat,
        ...[...EVENT_FORMAT_FIELDS, ...EVENT_RULE_FIELDS].filter((k) => k !== 'category' && k !== 'discipline' && k !== 'drawFormat')
          .reduce((acc, k) => ({ ...acc, ...pick(k) }), {}),
      } as CreateEventDto];
    })();
    const names = new Set<string>();
    return list.map((e) => {
      const key = e.name.trim().toLowerCase();
      if (names.has(key)) throw new BadRequestException(`Two events are called "${e.name}"`);
      names.add(key);
      return this.eventDefaults(e);
    });
  }

  private eventDefaults(e: CreateEventDto): Partial<EventEntity> {
    return {
      name: e.name,
      category: (e.category ?? 'OPEN') as any,
      discipline: (e.discipline ?? 'SINGLES') as any,
      drawFormat: e.drawFormat as any,
      maxParticipants: e.maxParticipants ?? 32,
      minParticipants: e.minParticipants ?? 4,
      seeded: e.seeded ?? true,
      numberOfGroups: e.numberOfGroups ?? null,
      advancePerGroup: e.advancePerGroup ?? null,
      ...this.stageRules(e),
    };
  }

  /**
   * An event's rules per stage (F-05). Knockout defaults to "best of 3,
   * full sets"; the group stage defaults to the knockout rules; the final
   * has no override unless one is given. The older single set of rules
   * (setsToWin ...) becomes both group and knockout rules.
   */
  private stageRules(e: any, current?: Pick<EventEntity, 'groupRules' | 'knockoutRules' | 'finalRules'>) {
    const legacy = legacyRules(e);
    const knockoutRules = this.checkedRules(e.knockoutRules ?? legacy ?? current?.knockoutRules ?? DEFAULT_RULES, 'knockoutRules');
    const groupRules = this.checkedRules(e.groupRules ?? legacy ?? current?.groupRules ?? knockoutRules, 'groupRules');
    const finalRules = e.finalRules === null ? null
      : e.finalRules ? this.checkedRules(e.finalRules, 'finalRules')
      : current?.finalRules ?? null;
    return { groupRules, knockoutRules, finalRules };
  }

  private checkedRules(r: Partial<RuleSet>, field: string): RuleSet {
    const rules = normaliseRules(r);
    const problems = ruleProblems(rules);
    if (problems.length) throw new BadRequestException(`${field}: ${problems.join('; ')}`);
    return rules;
  }

  // ── MATCH RULE PRESETS (F-05) ─────────────

  /** The built-in presets, plus the club's own when a club is given and the caller belongs to it. */
  async listPresets(actor: Actor, clubId?: string) {
    const builtIn = await this.presetsRepo.find({ where: { clubId: IsNull() }, order: { createdAt: 'ASC' } });
    if (!clubId) return builtIn;
    if (!isSuperAdmin(actor) && !isClubMember(actor, clubId)) throw new ForbiddenException('Not a member of this club');
    const own = await this.presetsRepo.find({ where: { clubId }, order: { name: 'ASC' } });
    return [...builtIn, ...own];
  }

  async createPreset(dto: CreatePresetDto, actor: Actor) {
    this.assertClubAdmin(actor, dto.clubId);
    await this.assertPresetNameFree(dto.clubId, dto.name);
    const preset = await this.presetsRepo.save(this.presetsRepo.create({
      clubId: dto.clubId, name: dto.name, rules: this.checkedRules(dto.rules, 'rules'), createdBy: actor.sub,
    }));
    this.auditLogger.record({ actorId: actor.sub, action: 'RULE_PRESET_CREATED', targetId: preset.id, clubId: dto.clubId });
    return preset;
  }

  /**
   * Editing a preset changes only the preset: events hold their own copies,
   * so nothing already set up (let alone being played) changes with it.
   */
  async updatePreset(id: string, dto: UpdatePresetDto, actor: Actor) {
    const preset = await this.loadClubPreset(id, actor);
    if (dto.name && dto.name.toLowerCase() !== preset.name.toLowerCase()) await this.assertPresetNameFree(preset.clubId, dto.name);
    if (dto.name) preset.name = dto.name;
    if (dto.rules) preset.rules = this.checkedRules(dto.rules, 'rules');
    return this.presetsRepo.save(preset);
  }

  async deletePreset(id: string, actor: Actor) {
    const preset = await this.loadClubPreset(id, actor);
    await this.presetsRepo.remove(preset);
    this.auditLogger.record({ actorId: actor.sub, action: 'RULE_PRESET_DELETED', targetId: id, clubId: preset.clubId });
  }

  private async loadClubPreset(id: string, actor: Actor) {
    const preset = await this.presetsRepo.findOne({ where: { id } });
    if (!preset) throw new NotFoundException('Preset not found');
    if (!preset.clubId) throw new ForbiddenException('Built-in presets cannot be changed');
    this.assertClubAdmin(actor, preset.clubId);
    return preset;
  }

  private assertClubAdmin(actor: Actor, clubId: string) {
    if (!isSuperAdmin(actor) && !isClubAdmin(actor, clubId)) {
      throw new ForbiddenException("Only an admin of this club can manage its presets");
    }
  }

  private async assertPresetNameFree(clubId: string, name: string) {
    const clash = (await this.presetsRepo.find({ where: [{ clubId }, { clubId: IsNull() }] }))
      .some((p) => p.name.toLowerCase() === name.trim().toLowerCase());
    if (clash) throw new BadRequestException(`There is already a preset called "${name}"`);
  }

  // ── EVENTS (F-01) ─────────────────────────

  async addEvent(tournamentId: string, dto: CreateEventDto, actor: Actor) {
    const t = await this.load(tournamentId);
    this.assertManage(actor, t);
    if (t.status !== 'DRAFT' && t.status !== 'OPEN') {
      throw new BadRequestException('Events can only be added before play starts');
    }
    if (t.events.some((e) => e.name.toLowerCase() === dto.name.trim().toLowerCase())) {
      throw new BadRequestException(`There is already an event called "${dto.name}"`);
    }
    if (t.events.length >= 10) throw new BadRequestException('A tournament can have at most 10 events');
    const ev = await this.eventsRepo.save(this.eventsRepo.create({
      ...this.eventDefaults(dto),
      tournamentId,
      position: t.events.length,
      status: t.status === 'OPEN' ? 'OPEN' : 'DRAFT',
    }));
    this.auditLogger.record({ actorId: actor.sub, action: 'EVENT_ADDED', targetId: ev.id, tournamentId });
    return ev;
  }

  async updateEvent(tournamentId: string, eventId: string, dto: UpdateEventDto, actor: Actor) {
    const t = await this.load(tournamentId);
    this.assertManage(actor, t);
    const ev = this.eventOf(t, eventId);
    if (ev.status !== 'DRAFT' && ev.status !== 'OPEN') {
      throw new BadRequestException('An event can no longer be edited once its draw is made');
    }
    const formatChanges = EVENT_FORMAT_FIELDS.filter((k) => (dto as any)[k] !== undefined);
    if (t.status !== 'DRAFT' && formatChanges.length) {
      throw new BadRequestException(`Only a DRAFT tournament's events can change: ${formatChanges.join(', ')}`);
    }
    const min = dto.minParticipants ?? ev.minParticipants;
    const max = dto.maxParticipants ?? ev.maxParticipants;
    if (min > max) throw new BadRequestException('minParticipants cannot be more than maxParticipants');
    if (dto.name && t.events.some((e) => e.id !== ev.id && e.name.toLowerCase() === dto.name.toLowerCase())) {
      throw new BadRequestException(`There is already an event called "${dto.name}"`);
    }
    const ruleChanges = EVENT_RULE_FIELDS.filter((k) => (dto as any)[k] !== undefined);
    const rules = ruleChanges.length ? this.stageRules(dto, ev) : null;
    for (const [k, v] of Object.entries(dto)) {
      if (v !== undefined && !(EVENT_RULE_FIELDS as readonly string[]).includes(k)) (ev as any)[k] = v;
    }
    if (rules) Object.assign(ev, rules);
    return this.eventsRepo.save(ev);
  }

  async removeEvent(tournamentId: string, eventId: string, actor: Actor) {
    const t = await this.load(tournamentId);
    this.assertManage(actor, t);
    const ev = this.eventOf(t, eventId);
    if (t.events.length === 1) throw new BadRequestException('A tournament needs at least one event');
    const entries = (t.participants ?? []).filter((p) => p.eventId === ev.id && p.status !== 'WITHDRAWN' && p.status !== 'REJECTED');
    if (ev.status === 'IN_PROGRESS' || ev.status === 'COMPLETED' || entries.length) {
      throw new BadRequestException('Only an event with no entries and no draw can be removed');
    }
    await this.eventsRepo.remove(ev);
    this.auditLogger.record({ actorId: actor.sub, action: 'EVENT_REMOVED', targetId: eventId, tournamentId });
  }

  /**
   * The event a request is about. eventId may be left out while the tournament
   * has exactly one event (the pre-F-01 routes keep working that way).
   */
  private eventOf(t: TournamentEntity, eventId?: string | null): EventEntity {
    const events = t.events ?? [];
    if (eventId) {
      const ev = events.find((e) => e.id === eventId);
      if (!ev) throw new NotFoundException('Event not found');
      return ev;
    }
    if (events.length === 1) return events[0];
    throw new BadRequestException('Say which event (eventId): this tournament has several');
  }

  /** club.upserted from auth-service: keep our copy of the club current. */
  async upsertClub(event: { id: string; name: string; slug: string; status: string }) {
    if (!event?.id || !event.name) return;
    await this.clubsRepo.save(this.clubsRepo.create({
      id: event.id, name: event.name, slug: event.slug ?? event.id, status: event.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    }));
  }

  async update(id: string, dto: UpdateTournamentDto, actor: Actor) {
    const t = await this.load(id);
    this.assertManage(actor, t);
    // Descriptive fields are editable in DRAFT and OPEN; once play has started
    // the tournament is frozen. Format and size are per event (updateEvent).
    if (t.status !== 'DRAFT' && t.status !== 'OPEN') {
      throw new BadRequestException(`A tournament that is ${t.status} can no longer be edited`);
    }
    // Cross-field rules, checked on the merged result since a PATCH usually
    // carries only one side of each pair (B-14).
    const day = (v: any) => (v == null ? null : String(v).slice(0, 10));
    const start = day(dto.startDate ?? t.startDate);
    const end = day(dto.endDate ?? t.endDate);
    const deadline = day(dto.registrationDeadline ?? t.registrationDeadline);
    if (start && end && end < start) {
      throw new BadRequestException('endDate must be on or after startDate');
    }
    if (deadline && start && deadline > start) {
      throw new BadRequestException('registrationDeadline must be on or before startDate');
    }
    // Copy only the validated DTO fields; status/createdBy/clubId can't
    // arrive here (forbidNonWhitelisted rejects them with 400).
    for (const [k, v] of Object.entries(dto)) {
      if (v !== undefined) (t as any)[k] = v;
    }
    const { events, participants, matches, groups, ...own } = t as any;
    await this.tournamentsRepo.save(own);
    return t;
  }

  async remove(id: string, actor: Actor) {
    const t = await this.load(id);
    this.assertManage(actor, t);
    if (t.status === 'IN_PROGRESS') throw new BadRequestException('Cannot delete a tournament that is in progress');
    await this.tournamentsRepo.remove(t);
    this.auditLogger.record({ actorId: actor.sub, action: 'TOURNAMENT_DELETED', targetId: id });
  }

  async open(id: string, actor: Actor) {
    const t = await this.load(id);
    this.assertManage(actor, t);
    if (t.status !== 'DRAFT') throw new BadRequestException('Tournament must be in DRAFT status to open registration');
    if (!t.events?.length) throw new BadRequestException('Add at least one event before opening registration');
    t.status = 'OPEN';
    await this.tournamentsRepo.update(t.id, { status: 'OPEN' });
    for (const ev of t.events) if (ev.status === 'DRAFT') ev.status = 'OPEN';
    await this.eventsRepo.save(t.events);
    return t;
  }

  // ── PARTICIPANTS ──────────────────────────

  async getMyParticipations(playerId: string) {
    const records = await this.participantsRepo.find({ where: { playerId } });
    return records.map((p: ParticipantEntity) => ({ tournamentId: p.tournamentId, eventId: p.eventId, participantId: p.id, status: p.status }));
  }

  async enroll(tournamentId: string, dto: EnrollParticipantDto, actor: Actor) {
    const t = await this.load(tournamentId);
    const requesterId = actor.sub;
    const manager = canManage(actor, t);
    if (dto.playerId !== requesterId && !manager) {
      throw new ForbiddenException('Cannot enroll another player');
    }
    if (!manager && !canEnter(actor, t, { clubActive: await this.clubActive(t.clubId) })) {
      throw new ForbiddenException('This tournament is only open to members of its club');
    }
    const ev = this.eventOf(t, dto.eventId);
    if (ev.status !== 'OPEN') throw new BadRequestException(`${ev.name} is not open for entries`);
    // The organiser can still add a late entry by hand.
    if (t.registrationDeadline && !manager && today() > String(t.registrationDeadline).slice(0, 10)) {
      throw new BadRequestException(`Registration closed on ${String(t.registrationDeadline).slice(0, 10)}`);
    }
    const approved = await this.participantsRepo.count({ where: { eventId: ev.id, status: 'APPROVED' } });
    if (approved >= ev.maxParticipants) throw new BadRequestException(`${ev.name} is full`);
    const existing = await this.participantsRepo.findOne({ where: { eventId: ev.id, playerId: dto.playerId } });
    if (existing) throw new BadRequestException(`Already entered in ${ev.name}`);
    const p = this.participantsRepo.create({
      tournamentId,
      eventId: ev.id,
      playerId: dto.playerId,
      partnerId: dto.partnerId ?? null,
      status: t.requiresApproval ? 'PENDING' : 'APPROVED',
    });
    return this.participantsRepo.save(p);
  }

  async approveParticipant(tournamentId: string, participantId: string, actor: Actor) {
    const t = await this.load(tournamentId);
    this.assertManage(actor, t);
    const p = await this.participantsRepo.findOne({ where: { id: participantId, tournamentId } });
    if (!p) throw new NotFoundException('Participant not found');
    const ev = this.eventOf(t, p.eventId);
    this.assertEntriesEditable(ev);
    if (p.status !== 'PENDING') throw new BadRequestException(`Only a pending entry can be approved (this one is ${p.status})`);
    const approved = await this.participantsRepo.count({ where: { eventId: ev.id, status: 'APPROVED' } });
    if (approved >= ev.maxParticipants)
      throw new BadRequestException(`${ev.name} is full (${approved}/${ev.maxParticipants} approved)`);
    p.status = 'APPROVED';
    const saved = await this.participantsRepo.save(p);
    this.auditLogger.record({ actorId: actor.sub, action: 'PARTICIPANT_APPROVED', targetId: participantId, tournamentId });
    return saved;
  }

  async rejectParticipant(tournamentId: string, participantId: string, actor: Actor) {
    const t = await this.load(tournamentId);
    this.assertManage(actor, t);
    const p = await this.participantsRepo.findOne({ where: { id: participantId, tournamentId } });
    if (!p) throw new NotFoundException('Participant not found');
    this.assertEntriesEditable(this.eventOf(t, p.eventId));
    if (p.status !== 'PENDING') throw new BadRequestException(`Only a pending entry can be rejected (this one is ${p.status})`);
    p.status = 'REJECTED';
    const saved = await this.participantsRepo.save(p);
    this.auditLogger.record({ actorId: actor.sub, action: 'PARTICIPANT_REJECTED', targetId: participantId, tournamentId });
    return saved;
  }

  async withdrawParticipant(tournamentId: string, participantId: string, actor: Actor) {
    const requesterId = actor.sub;
    const t = await this.load(tournamentId);
    const p = await this.participantsRepo.findOne({ where: { id: participantId, tournamentId } });
    if (!p) throw new NotFoundException('Participant not found');
    // Only this tournament's managers may withdraw anyone; a player may
    // withdraw themselves. Running some OTHER tournament grants nothing here.
    if (!canManage(actor, t) && p.playerId !== requesterId) throw new ForbiddenException('Not allowed');
    p.status = 'WITHDRAWN';
    const saved = await this.participantsRepo.save(p);
    this.auditLogger.record({ actorId: requesterId, action: 'PARTICIPANT_WITHDRAWN', targetId: participantId, tournamentId });
    return saved;
  }

  async assignSeed(tournamentId: string, participantId: string, seed: number | null, actor: Actor) {
    const t = await this.load(tournamentId);
    this.assertManage(actor, t);
    const p = await this.participantsRepo.findOne({ where: { id: participantId, tournamentId } });
    if (!p) throw new NotFoundException('Participant not found');
    const ev = this.eventOf(t, p.eventId);
    this.assertEntriesEditable(ev);
    if (seed !== null) {
      if (seed > ev.maxParticipants) throw new BadRequestException(`Seed must be between 1 and ${ev.maxParticipants}`);
      // Seeds are unique within an event (F-01).
      const clash = (t.participants ?? []).find((o) =>
        o.id !== p.id && o.eventId === p.eventId && o.seed === seed && o.status !== 'WITHDRAWN' && o.status !== 'REJECTED');
      if (clash) throw new BadRequestException(`Seed ${seed} is already taken`);
    }
    p.seed = seed;
    return this.participantsRepo.save(p);
  }

  /** The tournament, unfiltered. Callers check access themselves. */
  private async load(id: string) {
    const t = await this.tournamentsRepo.findOne({ where: { id }, relations: ['participants', 'matches', 'groups', 'events'] });
    if (!t) throw new NotFoundException('Tournament not found');
    t.events = (t.events ?? []).sort((a, b) => a.position - b.position);
    return t;
  }

  private assertManage(actor: Actor, t: TournamentEntity) {
    if (!canManage(actor, t)) throw new ForbiddenException('Only an admin of this club can manage this tournament');
  }

  /** A tournament without a club, or whose club we haven't heard of, counts as active. */
  private async clubActive(clubId: string | null) {
    if (!clubId) return true;
    return (await this.clubsRepo.findOne({ where: { id: clubId } }))?.status !== 'INACTIVE';
  }

  /** An event's entries, approvals and seeds are fixed once its draw is made. */
  private assertEntriesEditable(ev: { status: string }) {
    if (ev.status !== 'DRAFT' && ev.status !== 'OPEN')
      throw new BadRequestException('Entries and seeds are locked once the draw has been made');
  }

  // ── DRAW GENERATION ───────────────────────

  /**
   * Draw one event (F-01). The event must be OPEN; drawing it makes it
   * IN_PROGRESS, and the tournament IN_PROGRESS with it (status roll-up),
   * while its other events keep taking entries until they are drawn.
   */
  async generateDraw(tournamentId: string, actor: Actor, eventId?: string) {
    const t = await this.load(tournamentId);
    this.assertManage(actor, t);
    const ev = this.eventOf(t, eventId);
    if (ev.status !== 'OPEN') throw new BadRequestException(`${ev.name} must be open for entries to generate its draw`);

    const participants = await this.participantsRepo.find({ where: { tournamentId, eventId: ev.id, status: 'APPROVED' } });
    if (participants.length < ev.minParticipants)
      throw new BadRequestException(`Need at least ${ev.minParticipants} approved participants`);
    // B-17: never silently build a different draw from the one asked for.
    if (!SUPPORTED_FORMATS.includes(ev.drawFormat))
      throw new BadRequestException(`${ev.drawFormat} draws are not available yet; change the format first`);
    if (ev.discipline !== 'SINGLES' || ev.category === 'MIXED')
      throw new BadRequestException(`${ev.name} is not available yet (doubles pairs arrive with F-04)`);
    // Validate the configuration before the old draw is touched.
    if (ev.drawFormat === 'GROUP_STAGE_KNOCKOUT') this.groupConfig(ev, participants.length);

    await this.matchesRepo.delete({ eventId: ev.id });
    await this.groupsRepo.delete({ eventId: ev.id });

    let matches: TournamentMatchEntity[];
    if (ev.drawFormat === 'ROUND_ROBIN') matches = await this.generateRoundRobin(ev, participants);
    else if (ev.drawFormat === 'GROUP_STAGE_KNOCKOUT') matches = await this.generateGroupStage(ev, participants);
    else matches = await this.generateSingleElimination(ev, participants);

    ev.status = 'IN_PROGRESS';
    await this.eventsRepo.save(ev);
    if (t.status !== 'IN_PROGRESS') {
      await this.tournamentsRepo.update(tournamentId, { status: 'IN_PROGRESS' });
      t.status = 'IN_PROGRESS';
    }
    this.auditLogger.record({
      actorId: actor.sub, action: 'DRAW_GENERATED', targetId: tournamentId, eventId: ev.id, drawFormat: ev.drawFormat,
    });
    return { tournament: t, event: ev, matches };
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private ordered(participants: ParticipantEntity[], seeded: boolean): ParticipantEntity[] {
    if (!seeded) return this.shuffle(participants);
    const s = participants.filter(p => p.seed != null).sort((a, b) => a.seed - b.seed);
    return [...s, ...this.shuffle(participants.filter(p => p.seed == null))];
  }

  private nextPow2(n: number): number { let p = 1; while (p < n) p *= 2; return p; }

  /** Bracket order for `size` slots (1 v size, 2 v size-1, ...). `size` must be a power of two. */
  private seededSlots(size: number): number[] {
    if (!Number.isInteger(size) || size < 1 || (size & (size - 1)) !== 0)
      throw new Error(`seededSlots needs a power of two, got ${size}`);
    if (size === 1) return [0];
    const half = this.seededSlots(size / 2);
    const r = new Array(size);
    for (let i = 0; i < half.length; i++) { r[i * 2] = half[i]; r[i * 2 + 1] = size - 1 - half[i]; }
    return r;
  }

  private async generateSingleElimination(ev: EventEntity, participants: ParticipantEntity[]) {
    const ord = this.ordered(participants, ev.seeded);
    const size = this.nextPow2(ord.length);
    const rounds = Math.log2(size);
    const all: Partial<TournamentMatchEntity>[] = [];

    for (let round = 1; round <= rounds; round++) {
      const count = size / Math.pow(2, round);
      for (let pos = 0; pos < count; pos++)
        all.push({ id: uuidv4(), tournamentId: ev.tournamentId, eventId: ev.id, stage: 'KNOCKOUT', round, position: pos, status: 'SCHEDULED' });
    }

    for (const m of all) {
      if (m.round < rounds) {
        const next = all.find(n => n.round === m.round + 1 && n.position === Math.floor(m.position / 2));
        if (next) { m.nextMatchId = next.id; m.nextSlot = m.position % 2 === 0 ? 1 : 2; }
      }
    }

    const r1 = all.filter(m => m.round === 1);
    const slots = this.seededSlots(size);
    for (let i = 0; i < r1.length; i++) {
      const p1 = ord[slots[i * 2]] ?? null;
      const p2 = ord[slots[i * 2 + 1]] ?? null;

      // Normalise: BYE player always goes in participant1Id slot
      if (!p1 && p2) {
        r1[i].participant1Id = p2.id;
        r1[i].participant2Id = null;
      } else {
        r1[i].participant1Id = p1?.id ?? null;
        r1[i].participant2Id = p2?.id ?? null;
      }

      if (r1[i].participant1Id && !r1[i].participant2Id) {
        r1[i].status = 'BYE';
        r1[i].winnerId = r1[i].participant1Id;
        // Auto-advance BYE winner into the correct slot of the next-round match
        const nextMatch = r1[i].nextMatchId
          ? all.find(m => m.id === r1[i].nextMatchId)
          : null;
        if (nextMatch) {
          if (r1[i].nextSlot === 1) nextMatch.participant1Id = r1[i].participant1Id;
          else                      nextMatch.participant2Id = r1[i].participant1Id;
        }
      }
    }

    return this.matchesRepo.save(all as TournamentMatchEntity[]);
  }

  private async generateRoundRobin(ev: EventEntity, participants: ParticipantEntity[]) {
    const all: Partial<TournamentMatchEntity>[] = [];
    for (let i = 0; i < participants.length; i++)
      for (let j = i + 1; j < participants.length; j++)
        all.push({ id: uuidv4(), tournamentId: ev.tournamentId, eventId: ev.id, stage: 'KNOCKOUT', round: 1, position: all.length, participant1Id: participants[i].id, participant2Id: participants[j].id, status: 'SCHEDULED' });
    return this.matchesRepo.save(all as TournamentMatchEntity[]);
  }

  /**
   * Group sizes for Group Stage + Knockout. Every group needs at least 3
   * players and at least one more player than it sends through (B-10).
   */
  private groupConfig(ev: EventEntity, players: number) {
    const numGroups = ev.numberOfGroups ?? 4;
    const advancePerGroup = ev.advancePerGroup ?? 2;
    const smallest = Math.floor(players / numGroups);
    if (smallest < 3) {
      const fits = Math.floor(players / 3);
      throw new BadRequestException(fits >= 2
        ? `${players} players can't fill ${numGroups} groups of at least 3; use at most ${fits} groups`
        : `Group Stage + Knockout needs at least 6 players (2 groups of 3); there are ${players}`);
    }
    if (smallest < advancePerGroup + 1) {
      throw new BadRequestException(
        `With ${numGroups} groups the smallest group has ${smallest} players, so at most ${smallest - 1} can advance from each`);
    }
    return { numGroups, advancePerGroup };
  }

  private async generateGroupStage(ev: EventEntity, participants: ParticipantEntity[]) {
    const { numGroups, advancePerGroup } = this.groupConfig(ev, participants.length);
    const shuffled = this.shuffle(participants);
    const all: Partial<TournamentMatchEntity>[] = [];

    // ── Create groups and assign participants (snake-draft) ──
    const groups: TournamentGroupEntity[] = await this.groupsRepo.save(
      Array.from({ length: numGroups }, (_, g) => this.groupsRepo.create({
        tournamentId: ev.tournamentId, eventId: ev.id, name: `Group ${GROUP_LETTERS[g]}`, position: g, participantIds: [],
      })),
    );

    for (let i = 0; i < shuffled.length; i++) {
      const group = groups[i % numGroups];
      group.participantIds.push(shuffled[i].id);
      shuffled[i].groupId = group.id;
    }
    await this.participantsRepo.save(shuffled);
    await this.groupsRepo.save(groups);

    // ── Generate round-robin matches per group ──
    for (const group of groups) {
      const members = shuffled.filter(p => p.groupId === group.id);
      let round = 1;
      for (let i = 0; i < members.length; i++)
        for (let j = i + 1; j < members.length; j++)
          all.push({ id: uuidv4(), tournamentId: ev.tournamentId, eventId: ev.id, stage: 'GROUP', round: round++, position: all.length, participant1Id: members[i].id, participant2Id: members[j].id, groupId: group.id, status: 'SCHEDULED' });
    }

    // ── Pre-build knockout bracket with slot labels ──
    // Slots in seeding order: A1, B1, C1, D1 … then A2, B2, C2, D2 …
    const slotLabels: string[] = [];
    for (let rank = 1; rank <= advancePerGroup; rank++)
      for (let g = 0; g < numGroups; g++)
        slotLabels.push(`${GROUP_LETTERS[g]}${rank}`);

    // The bracket is padded to the next power of two. Seeding order puts the
    // padding against the top qualifiers, who get a bye (wired up in F-09).
    const size = this.nextPow2(slotLabels.length);
    const koRounds = Math.log2(size);
    const koAll: Partial<TournamentMatchEntity>[] = [];

    for (let round = 1; round <= koRounds; round++) {
      const count = size / Math.pow(2, round);
      for (let pos = 0; pos < count; pos++)
        koAll.push({ id: uuidv4(), tournamentId: ev.tournamentId, eventId: ev.id, stage: 'KNOCKOUT', round, position: pos, status: 'SCHEDULED' });
    }

    // Link nextMatchId (same logic as single elimination)
    for (const m of koAll) {
      if (m.round < koRounds) {
        const next = koAll.find(n => n.round === m.round + 1 && n.position === Math.floor(m.position / 2));
        if (next) { m.nextMatchId = next.id; m.nextSlot = m.position % 2 === 0 ? 1 : 2; }
      }
    }

    // Assign slot labels to round-1 knockout matches using seeded bracket positions
    const r1KO = koAll.filter(m => m.round === 1).sort((a, b) => a.position - b.position);
    const slots = this.seededSlots(size);
    for (let i = 0; i < r1KO.length; i++) {
      r1KO[i].slot1 = slotLabels[slots[i * 2]] ?? 'BYE';
      r1KO[i].slot2 = slotLabels[slots[i * 2 + 1]] ?? 'BYE';
    }

    all.push(...koAll);
    return this.matchesRepo.save(all as TournamentMatchEntity[]);
  }

  // ── DRAW MANAGEMENT ───────────────────────

  async swapParticipants(tournamentId: string, dto: SwapDrawDto, actor: Actor) {
    const t = await this.load(tournamentId);
    this.assertManage(actor, t);
    // Both players must be in the same event; only that event's draw changes.
    const byId = new Map((t.participants ?? []).map((p) => [p.id, p]));
    const e1 = byId.get(dto.participantId1)?.eventId;
    const e2 = byId.get(dto.participantId2)?.eventId;
    if (e1 && e2 && e1 !== e2) throw new BadRequestException('Players can only be swapped within one event');
    const matches = await this.matchesRepo.find({ where: e1 || e2 ? { tournamentId, eventId: e1 || e2 } : { tournamentId } });
    this.assertDrawEditable(matches);
    const changed: TournamentMatchEntity[] = [];
    for (const m of matches) {
      let isChanged = false;
      if (m.participant1Id === dto.participantId1) { m.participant1Id = dto.participantId2; isChanged = true; }
      else if (m.participant1Id === dto.participantId2) { m.participant1Id = dto.participantId1; isChanged = true; }
      if (m.participant2Id === dto.participantId1) { m.participant2Id = dto.participantId2; isChanged = true; }
      else if (m.participant2Id === dto.participantId2) { m.participant2Id = dto.participantId1; isChanged = true; }
      if (isChanged) changed.push(m);
    }
    if (changed.length > 0) await this.matchesRepo.save(changed);
    return this.matchesRepo.find({ where: { tournamentId }, order: { round: 'ASC', position: 'ASC' } });
  }

  async updateDrawSlot(tournamentId: string, matchId: string, slot: string, participantId: string | null, actor: Actor) {
    const t = await this.load(tournamentId);
    this.assertManage(actor, t);
    const match = await this.matchesRepo.findOne({ where: { id: matchId, tournamentId } });
    if (!match) throw new NotFoundException('Match not found');
    this.assertDrawEditable(await this.matchesRepo.find({ where: { tournamentId, eventId: match.eventId } }));
    if (slot === 'participant1Id') match.participant1Id = participantId;
    else if (slot === 'participant2Id') match.participant2Id = participantId;
    else throw new BadRequestException('slot must be participant1Id or participant2Id');
    // If both slots empty it's no longer a BYE
    if (match.participant1Id && match.participant2Id) match.status = 'SCHEDULED';
    else if (!match.participant2Id && match.participant1Id) match.status = 'BYE';
    return this.matchesRepo.save(match);
  }

  /** Once any match has a result, moving players around would rewrite history (B-19). */
  private assertDrawEditable(matches: TournamentMatchEntity[]) {
    if (matches.some((m) => m.status === 'COMPLETED' || m.status === 'WALKOVER'))
      throw new BadRequestException('The draw is locked once a match has been played');
  }

  async updateMatch(tournamentId: string, matchId: string, dto: UpdateMatchDto, actor: Actor) {
    const t = await this.load(tournamentId);
    this.assertManage(actor, t);
    const match = await this.matchesRepo.findOne({ where: { id: matchId, tournamentId } });
    if (!match) throw new NotFoundException('Match not found');

    // A walkover is a result too, and can be corrected like one (F-06).
    const wasCompleted = match.status === 'COMPLETED' || match.status === 'WALKOVER';
    const isResult = dto.winnerId !== undefined || dto.sets !== undefined || dto.status === 'COMPLETED' || dto.outcome !== undefined;

    // Scheduling or "now playing" changes carry no result.
    if (!isResult) {
      if (dto.status) {
        if (wasCompleted || match.status === 'BYE' || match.status === 'WALKOVER')
          throw new BadRequestException(`A ${match.status} match cannot be set to ${dto.status}`);
        match.status = dto.status as any;
      }
      if (dto.scheduledAt) match.scheduledAt = new Date(dto.scheduledAt);
      return this.matchesRepo.save(match);
    }

    // ── A result: validate it completely before touching anything ──
    if (t.status !== 'IN_PROGRESS') throw new BadRequestException('Results can only be recorded while the tournament is in progress');
    if (match.status === 'BYE')
      throw new BadRequestException('A BYE match has no score to record');
    if (!match.participant1Id || !match.participant2Id)
      throw new BadRequestException('Both players must be known before the match can be scored');
    if (!dto.winnerId) throw new BadRequestException('Say who won (winnerId)');
    if (dto.winnerId !== match.participant1Id && dto.winnerId !== match.participant2Id)
      throw new BadRequestException('The winner must be one of the two players in this match');

    // F-06: the score must be possible under this match's rules (its stage's
    // rules, or the final's override). Retirement and default may end a set
    // early; a walkover has no score.
    const matchEvent = (t.events ?? []).find((e) => e.id === match.eventId);
    const rules = matchEvent ? rulesFor(matchEvent, match) : DEFAULT_RULES;
    const outcome: Outcome = (dto.outcome as Outcome) ?? 'COMPLETED';
    const check = validateScore(rules, (dto.sets ?? []) as SetScore[], outcome);
    if (!check.ok) throw new BadRequestException(check.error);
    const winnerIsP1 = dto.winnerId === match.participant1Id;
    if (check.winner && (check.winner === 1) !== winnerIsP1)
      throw new BadRequestException('The scores say the other player won: the winner must have won more sets than the opponent');

    const sets = check.sets.map((s) => ({
      p1: s.p1, p2: s.p2, ...(s.tb != null ? { tb: s.tb } : {}), ...(s.isMatchTiebreak ? { isMatchTiebreak: true } : {}),
    }));
    const previous = wasCompleted ? this.resultEvent(t, match) : null;
    if (wasCompleted && match.winnerId === dto.winnerId && (match.outcome ?? 'COMPLETED') === outcome
      && JSON.stringify(match.sets ?? []) === JSON.stringify(sets)) {
      return match; // the same result re-submitted: nothing changes, nothing is emitted
    }

    // ── Advance (or, on a correction, re-advance) the winner ──
    let next: TournamentMatchEntity | null = null;
    if (match.nextMatchId) {
      next = await this.matchesRepo.findOne({ where: { id: match.nextMatchId, tournamentId } });
      if (next) {
        const winnerChanged = wasCompleted && match.winnerId !== dto.winnerId;
        if (winnerChanged && (next.status === 'COMPLETED' || next.status === 'WALKOVER' || next.winnerId))
          throw new ConflictException('The next-round match has already been played; correct that result first');
        // Older draws have no nextSlot stored; the bracket position gives the same answer.
        const slot = match.nextSlot ?? (match.position % 2 === 0 ? 1 : 2);
        if (slot === 1) next.participant1Id = dto.winnerId;
        else next.participant2Id = dto.winnerId;
      }
    }

    match.sets = sets;
    match.winnerId = dto.winnerId;
    match.outcome = outcome;
    match.status = outcome === 'WALKOVER' ? 'WALKOVER' : 'COMPLETED';
    match.completedAt = new Date();

    // Match completion and next-round advancement must land together —
    // otherwise a mid-write failure leaves the match COMPLETED with its
    // winner never advanced, which is unrecoverable without manual repair.
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    let saved: TournamentMatchEntity;
    try {
      saved = await queryRunner.manager.save(match);
      if (next) await queryRunner.manager.save(next);
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    this.auditLogger.record({
      actorId: actor.sub,
      action: previous ? 'MATCH_RESULT_CORRECTED' : 'MATCH_RESULT_RECORDED',
      targetId: matchId, tournamentId, winnerId: dto.winnerId,
    });

    const event = this.resultEvent(t, saved);
    if (previous) {
      // stats-service reverses the previous result and applies this one (B-18).
      this.statsClient.emit('match.corrected', { ...event, previous });
    } else {
      this.statsClient.emit('match.completed', event);
      this.notificationsClient.emit('match.completed', event);
    }
    return saved;
  }

  /** The payload of match.completed / match.corrected for a scored match. */
  private resultEvent(t: TournamentEntity, m: TournamentMatchEntity) {
    const pMap = Object.fromEntries((t.participants ?? []).map((p: ParticipantEntity) => [p.id, p]));
    const p1 = pMap[m.participant1Id];
    const p2 = pMap[m.participant2Id];
    const p1Won = m.winnerId === m.participant1Id;
    return {
      matchId: m.id,
      tournamentId: t.id,
      tournamentName: t.name,
      eventId: m.eventId,
      eventName: (t.events ?? []).find((e) => e.id === m.eventId)?.name,
      surface: t.surface,
      stage: m.stage,
      round: m.round,
      participant1Id: m.participant1Id,
      participant2Id: m.participant2Id,
      player1Id: p1?.playerId ?? m.participant1Id,
      player2Id: p2?.playerId ?? m.participant2Id,
      winnerId: m.winnerId,
      winnerPlayerId: (p1Won ? p1 : p2)?.playerId ?? m.winnerId,
      loserPlayerId: (p1Won ? p2 : p1)?.playerId ?? (p1Won ? m.participant2Id : m.participant1Id),
      sets: m.sets ?? [],
      outcome: m.outcome ?? 'COMPLETED',
    };
  }

  health() { return { status: 'ok', service: 'tournament-service' }; }
}
