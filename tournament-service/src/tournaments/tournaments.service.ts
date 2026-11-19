import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException, Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { v4 as uuidv4 } from 'uuid';
import { TournamentEntity } from './entities/tournament.entity';
import { ParticipantEntity } from './entities/participant.entity';
import { TournamentMatchEntity } from './entities/match.entity';
import { TournamentGroupEntity } from './entities/group.entity';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto, FORMAT_FIELDS } from './dto/update-tournament.dto';
import { EnrollParticipantDto } from './dto/enroll-participant.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { SwapDrawDto } from './dto/swap-draw.dto';
import { AuditLogger } from '../audit/audit-logger.service';

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
    @Inject('STATS_CLIENT')
    private readonly statsClient: ClientProxy,
    @Inject('NOTIFICATIONS_CLIENT')
    private readonly notificationsClient: ClientProxy,
    private readonly auditLogger: AuditLogger,
    private readonly dataSource: DataSource,
  ) {}

  // ── CRUD ──────────────────────────────────

  findAll() {
    return this.tournamentsRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string) {
    const t = await this.tournamentsRepo.findOne({
      where: { id },
      relations: ['participants', 'matches', 'groups'],
    });
    if (!t) throw new NotFoundException('Tournament not found');
    return t;
  }

  async create(dto: CreateTournamentDto, organiserId: string): Promise<TournamentEntity> {
    const t = this.tournamentsRepo.create({
      ...(dto as any),
      organiserId,
      status: 'DRAFT',
      maxParticipants: dto.maxParticipants ?? 32,
      minParticipants: dto.minParticipants ?? 4,
      ageGroup: (dto.ageGroup ?? 'OPEN') as any,
      seeded: dto.seeded ?? true,
      isPublic: dto.isPublic ?? true,
      requiresApproval: dto.requiresApproval ?? false,
      setsToWin: dto.setsToWin ?? 2,
      gamesPerSet: dto.gamesPerSet ?? 6,
      tiebreakAt: dto.tiebreakAt ?? 6,
      finalSetTiebreak: dto.finalSetTiebreak ?? false,
      noAd: dto.noAd ?? false,
    } as any) as unknown as TournamentEntity;
    return this.tournamentsRepo.save(t);
  }

  async update(id: string, dto: UpdateTournamentDto, organiserId: string) {
    const t = await this.findOne(id);
    if (t.organiserId !== organiserId) throw new ForbiddenException('Not your tournament');
    // Descriptive fields are editable in DRAFT and OPEN; anything that shapes
    // the draw only in DRAFT. Once play has started the tournament is frozen.
    if (t.status !== 'DRAFT' && t.status !== 'OPEN') {
      throw new BadRequestException(`A tournament that is ${t.status} can no longer be edited`);
    }
    const formatChanges = FORMAT_FIELDS.filter((f) => (dto as any)[f] !== undefined);
    if (t.status !== 'DRAFT' && formatChanges.length) {
      throw new BadRequestException(`Only a DRAFT tournament can change: ${formatChanges.join(', ')}`);
    }
    const start = dto.startDate ?? (t as any).startDate;
    const end = dto.endDate ?? (t as any).endDate;
    if (start && end && new Date(end) < new Date(start)) {
      throw new BadRequestException('endDate must be on or after startDate');
    }
    // Copy only the validated DTO fields; status/organiserId/clubId can't
    // arrive here (forbidNonWhitelisted rejects them with 400).
    for (const [k, v] of Object.entries(dto)) {
      if (v !== undefined) (t as any)[k] = v;
    }
    return this.tournamentsRepo.save(t);
  }

  async remove(id: string, organiserId: string) {
    const t = await this.findOne(id);
    if (t.organiserId !== organiserId) throw new ForbiddenException('Not your tournament');
    if (t.status === 'IN_PROGRESS') throw new BadRequestException('Cannot delete a tournament that is in progress');
    await this.tournamentsRepo.remove(t);
    this.auditLogger.record({ actorId: organiserId, action: 'TOURNAMENT_DELETED', targetId: id });
  }

  async open(id: string, organiserId: string) {
    const t = await this.findOne(id);
    if (t.organiserId !== organiserId) throw new ForbiddenException('Not your tournament');
    if (t.status !== 'DRAFT') throw new BadRequestException('Tournament must be in DRAFT status to open registration');
    t.status = 'OPEN';
    return this.tournamentsRepo.save(t);
  }

  // ── PARTICIPANTS ──────────────────────────

  getParticipants(tournamentId: string) {
    return this.participantsRepo.find({ where: { tournamentId } });
  }

  async getMyParticipations(playerId: string) {
    const records = await this.participantsRepo.find({ where: { playerId } });
    return records.map((p: ParticipantEntity) => ({ tournamentId: p.tournamentId, participantId: p.id, status: p.status }));
  }

  async enroll(tournamentId: string, dto: EnrollParticipantDto, requesterId: string) {
    const t = await this.findOne(tournamentId);
    if (dto.playerId !== requesterId && t.organiserId !== requesterId) {
      throw new ForbiddenException('Cannot enroll another player');
    }
    if (t.status !== 'OPEN') throw new BadRequestException('Tournament is not open for registration');
    const approved = await this.participantsRepo.count({ where: { tournamentId, status: 'APPROVED' } });
    if (approved >= t.maxParticipants) throw new BadRequestException('Tournament is full');
    const existing = await this.participantsRepo.findOne({ where: { tournamentId, playerId: dto.playerId } });
    if (existing) throw new BadRequestException('Player already enrolled');
    const p = this.participantsRepo.create({
      tournamentId,
      playerId: dto.playerId,
      partnerId: dto.partnerId ?? null,
      status: t.requiresApproval ? 'PENDING' : 'APPROVED',
    });
    return this.participantsRepo.save(p);
  }

  async approveParticipant(tournamentId: string, participantId: string, organiserId: string) {
    const t = await this.findOne(tournamentId);
    if (t.organiserId !== organiserId) throw new ForbiddenException('Not your tournament');
    const p = await this.participantsRepo.findOne({ where: { id: participantId, tournamentId } });
    if (!p) throw new NotFoundException('Participant not found');
    p.status = 'APPROVED';
    const saved = await this.participantsRepo.save(p);
    this.auditLogger.record({ actorId: organiserId, action: 'PARTICIPANT_APPROVED', targetId: participantId, tournamentId });
    return saved;
  }

  async rejectParticipant(tournamentId: string, participantId: string, organiserId: string) {
    const t = await this.findOne(tournamentId);
    if (t.organiserId !== organiserId) throw new ForbiddenException('Not your tournament');
    const p = await this.participantsRepo.findOne({ where: { id: participantId, tournamentId } });
    if (!p) throw new NotFoundException('Participant not found');
    p.status = 'REJECTED';
    const saved = await this.participantsRepo.save(p);
    this.auditLogger.record({ actorId: organiserId, action: 'PARTICIPANT_REJECTED', targetId: participantId, tournamentId });
    return saved;
  }

  async withdrawParticipant(tournamentId: string, participantId: string, requesterId: string) {
    const t = await this.findOne(tournamentId);
    const p = await this.participantsRepo.findOne({ where: { id: participantId, tournamentId } });
    if (!p) throw new NotFoundException('Participant not found');
    // Only this tournament's owner may withdraw anyone; a player may withdraw
    // themselves. Organising some OTHER tournament grants nothing here.
    const isOwner = t.organiserId === requesterId;
    if (!isOwner && p.playerId !== requesterId) throw new ForbiddenException('Not allowed');
    p.status = 'WITHDRAWN';
    const saved = await this.participantsRepo.save(p);
    this.auditLogger.record({ actorId: requesterId, action: 'PARTICIPANT_WITHDRAWN', targetId: participantId, tournamentId });
    return saved;
  }

  async assignSeed(tournamentId: string, participantId: string, seed: number, organiserId: string) {
    const t = await this.findOne(tournamentId);
    if (t.organiserId !== organiserId) throw new ForbiddenException('Not your tournament');
    const p = await this.participantsRepo.findOne({ where: { id: participantId, tournamentId } });
    if (!p) throw new NotFoundException('Participant not found');
    p.seed = seed;
    return this.participantsRepo.save(p);
  }

  // ── DRAW GENERATION ───────────────────────

  async generateDraw(tournamentId: string, organiserId: string) {
    const t = await this.findOne(tournamentId);
    if (t.organiserId !== organiserId) throw new ForbiddenException('Not your tournament');
    if (t.status !== 'OPEN') throw new BadRequestException('Tournament must be OPEN to generate draw');

    const participants = await this.participantsRepo.find({ where: { tournamentId, status: 'APPROVED' } });
    if (participants.length < t.minParticipants)
      throw new BadRequestException(`Need at least ${t.minParticipants} approved participants`);

    await this.matchesRepo.delete({ tournamentId });
    await this.groupsRepo.delete({ tournamentId });

    let matches: TournamentMatchEntity[];
    if (t.drawFormat === 'ROUND_ROBIN') matches = await this.generateRoundRobin(t, participants);
    else if (t.drawFormat === 'GROUP_STAGE_KNOCKOUT') matches = await this.generateGroupStage(t, participants);
    else matches = await this.generateSingleElimination(t, participants);

    await this.tournamentsRepo.update(tournamentId, { status: 'IN_PROGRESS' });
    t.status = 'IN_PROGRESS';
    this.auditLogger.record({ actorId: organiserId, action: 'DRAW_GENERATED', targetId: tournamentId, drawFormat: t.drawFormat });
    return { tournament: t, matches };
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

  private seededSlots(size: number): number[] {
    if (size === 1) return [0];
    const half = this.seededSlots(size / 2);
    const r = new Array(size);
    for (let i = 0; i < half.length; i++) { r[i * 2] = half[i]; r[i * 2 + 1] = size - 1 - half[i]; }
    return r;
  }

  private async generateSingleElimination(t: TournamentEntity, participants: ParticipantEntity[]) {
    const ord = this.ordered(participants, t.seeded);
    const size = this.nextPow2(ord.length);
    const rounds = Math.log2(size);
    const all: Partial<TournamentMatchEntity>[] = [];

    for (let round = 1; round <= rounds; round++) {
      const count = size / Math.pow(2, round);
      for (let pos = 0; pos < count; pos++)
        all.push({ id: uuidv4(), tournamentId: t.id, stage: 'KNOCKOUT', round, position: pos, status: 'SCHEDULED' });
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

  private async generateRoundRobin(t: TournamentEntity, participants: ParticipantEntity[]) {
    const all: Partial<TournamentMatchEntity>[] = [];
    for (let i = 0; i < participants.length; i++)
      for (let j = i + 1; j < participants.length; j++)
        all.push({ id: uuidv4(), tournamentId: t.id, stage: 'KNOCKOUT', round: 1, position: all.length, participant1Id: participants[i].id, participant2Id: participants[j].id, status: 'SCHEDULED' });
    return this.matchesRepo.save(all as TournamentMatchEntity[]);
  }

  private async generateGroupStage(t: TournamentEntity, participants: ParticipantEntity[]) {
    const numGroups = t.numberOfGroups ?? 4;
    const advancePerGroup = t.advancePerGroup ?? 2;
    const shuffled = this.shuffle(participants);
    const all: Partial<TournamentMatchEntity>[] = [];

    // ── Create groups and assign participants (snake-draft) ──
    const groups: TournamentGroupEntity[] = await this.groupsRepo.save(
      Array.from({ length: numGroups }, (_, g) => this.groupsRepo.create({
        tournamentId: t.id, name: `Group ${GROUP_LETTERS[g]}`, position: g, participantIds: [],
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
          all.push({ id: uuidv4(), tournamentId: t.id, stage: 'GROUP', round: round++, position: all.length, participant1Id: members[i].id, participant2Id: members[j].id, groupId: group.id, status: 'SCHEDULED' });
    }

    // ── Pre-build knockout bracket with slot labels ──
    // Slots in seeding order: A1, B1, C1, D1 … then A2, B2, C2, D2 …
    const slotLabels: string[] = [];
    for (let rank = 1; rank <= advancePerGroup; rank++)
      for (let g = 0; g < numGroups; g++)
        slotLabels.push(`${GROUP_LETTERS[g]}${rank}`);

    const totalKO = slotLabels.length;
    const koRounds = Math.ceil(Math.log2(totalKO));
    const koAll: Partial<TournamentMatchEntity>[] = [];

    for (let round = 1; round <= koRounds; round++) {
      const count = totalKO / Math.pow(2, round);
      for (let pos = 0; pos < count; pos++)
        koAll.push({ id: uuidv4(), tournamentId: t.id, stage: 'KNOCKOUT', round, position: pos, status: 'SCHEDULED' });
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
    const slots = this.seededSlots(totalKO);
    for (let i = 0; i < r1KO.length; i++) {
      r1KO[i].slot1 = slotLabels[slots[i * 2]];
      r1KO[i].slot2 = slotLabels[slots[i * 2 + 1]];
    }

    all.push(...koAll);
    return this.matchesRepo.save(all as TournamentMatchEntity[]);
  }

  // ── DRAW MANAGEMENT ───────────────────────

  getDraw(tournamentId: string) {
    return this.matchesRepo.find({ where: { tournamentId }, order: { round: 'ASC', position: 'ASC' } });
  }

  async swapParticipants(tournamentId: string, dto: SwapDrawDto, organiserId: string) {
    const t = await this.findOne(tournamentId);
    if (t.organiserId !== organiserId) throw new ForbiddenException('Not your tournament');
    const matches = await this.matchesRepo.find({ where: { tournamentId } });
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
    return this.getDraw(tournamentId);
  }

  async updateDrawSlot(tournamentId: string, matchId: string, slot: string, participantId: string | null, organiserId: string) {
    const t = await this.findOne(tournamentId);
    if (t.organiserId !== organiserId) throw new ForbiddenException('Not your tournament');
    const match = await this.matchesRepo.findOne({ where: { id: matchId, tournamentId } });
    if (!match) throw new NotFoundException('Match not found');
    if (slot === 'participant1Id') match.participant1Id = participantId;
    else if (slot === 'participant2Id') match.participant2Id = participantId;
    else throw new BadRequestException('slot must be participant1Id or participant2Id');
    // If both slots empty it's no longer a BYE
    if (match.participant1Id && match.participant2Id) match.status = 'SCHEDULED';
    else if (!match.participant2Id && match.participant1Id) match.status = 'BYE';
    return this.matchesRepo.save(match);
  }

  async updateMatch(tournamentId: string, matchId: string, dto: UpdateMatchDto, organiserId: string) {
    const t = await this.findOne(tournamentId);
    if (t.organiserId !== organiserId) throw new ForbiddenException('Not your tournament');
    const match = await this.matchesRepo.findOne({ where: { id: matchId, tournamentId } });
    if (!match) throw new NotFoundException('Match not found');

    const wasCompleted = match.status === 'COMPLETED';
    const isResult = dto.winnerId !== undefined || dto.sets !== undefined || dto.status === 'COMPLETED';

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
    if (match.status === 'BYE' || match.status === 'WALKOVER')
      throw new BadRequestException(`A ${match.status} match has no score to record`);
    if (!match.participant1Id || !match.participant2Id)
      throw new BadRequestException('Both players must be known before the match can be scored');
    if (!dto.winnerId || !dto.sets?.length)
      throw new BadRequestException('A result needs both the set scores and the winnerId');
    if (dto.winnerId !== match.participant1Id && dto.winnerId !== match.participant2Id)
      throw new BadRequestException('The winner must be one of the two players in this match');
    let setsP1 = 0, setsP2 = 0;
    for (const s of dto.sets) {
      if (s.p1 === s.p2) throw new BadRequestException(`A set cannot end level (${s.p1}-${s.p2})`);
      if (s.p1 > s.p2) setsP1++; else setsP2++;
    }
    const winnerIsP1 = dto.winnerId === match.participant1Id;
    if ((winnerIsP1 ? setsP1 : setsP2) <= (winnerIsP1 ? setsP2 : setsP1))
      throw new BadRequestException('The winner must have won more sets than the opponent');

    const sets = dto.sets.map((s) => ({ p1: s.p1, p2: s.p2 }));
    const previous = wasCompleted ? this.resultEvent(t, match) : null;
    if (wasCompleted && match.winnerId === dto.winnerId && JSON.stringify(match.sets ?? []) === JSON.stringify(sets)) {
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
    match.status = 'COMPLETED';
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
      actorId: organiserId,
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
    };
  }

  health() { return { status: 'ok', service: 'tournament-service' }; }
}
