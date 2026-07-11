import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException, Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { v4 as uuidv4 } from 'uuid';
import { TournamentEntity } from './entities/tournament.entity';
import { ParticipantEntity } from './entities/participant.entity';
import { TournamentMatchEntity } from './entities/match.entity';
import { TournamentGroupEntity } from './entities/group.entity';
import { CreateTournamentDto } from './dto/create-tournament.dto';
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

  async update(id: string, dto: Partial<CreateTournamentDto>, organiserId: string) {
    const t = await this.findOne(id);
    if (t.organiserId !== organiserId) throw new ForbiddenException('Not your tournament');
    Object.assign(t, dto);
    return this.tournamentsRepo.save(t);
  }

  async remove(id: string, organiserId: string) {
    const t = await this.findOne(id);
    if (t.organiserId !== organiserId) throw new ForbiddenException('Not your tournament');
    await this.tournamentsRepo.remove(t);
    this.auditLogger.record({ actorId: organiserId, action: 'TOURNAMENT_DELETED', targetId: id });
  }

  async open(id: string, organiserId: string) {
    const t = await this.findOne(id);
    if (t.organiserId !== organiserId) throw new ForbiddenException('Not your tournament');
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

  async withdrawParticipant(tournamentId: string, participantId: string, requesterId: string, isOrganiser: boolean) {
    const t = await this.findOne(tournamentId);
    const p = await this.participantsRepo.findOne({ where: { id: participantId, tournamentId } });
    if (!p) throw new NotFoundException('Participant not found');
    // Organiser can withdraw anyone; a player can only withdraw themselves
    if (!isOrganiser && p.playerId !== requesterId) throw new ForbiddenException('Not allowed');
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
        if (next) m.nextMatchId = next.id;
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
          if (r1[i].position % 2 === 0) nextMatch.participant1Id = r1[i].participant1Id;
          else                           nextMatch.participant2Id = r1[i].participant1Id;
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
    const groups: TournamentGroupEntity[] = [];
    for (let g = 0; g < numGroups; g++)
      groups.push(await this.groupsRepo.save(this.groupsRepo.create({
        tournamentId: t.id, name: `Group ${GROUP_LETTERS[g]}`, position: g, participantIds: [],
      })));

    for (let i = 0; i < shuffled.length; i++) {
      const group = groups[i % numGroups];
      group.participantIds.push(shuffled[i].id);
      shuffled[i].groupId = group.id;
      await this.participantsRepo.save(shuffled[i]);
    }
    for (const g of groups) await this.groupsRepo.save(g);

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
        if (next) m.nextMatchId = next.id;
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
    for (const m of matches) {
      let changed = false;
      if (m.participant1Id === dto.participantId1) { m.participant1Id = dto.participantId2; changed = true; }
      else if (m.participant1Id === dto.participantId2) { m.participant1Id = dto.participantId1; changed = true; }
      if (m.participant2Id === dto.participantId1) { m.participant2Id = dto.participantId2; changed = true; }
      else if (m.participant2Id === dto.participantId2) { m.participant2Id = dto.participantId1; changed = true; }
      if (changed) await this.matchesRepo.save(m);
    }
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
    if (dto.sets) match.sets = dto.sets;
    if (dto.status) match.status = dto.status as any;
    if (dto.scheduledAt) match.scheduledAt = new Date(dto.scheduledAt);
    if (dto.winnerId) {
      match.winnerId = dto.winnerId;
      match.status = 'COMPLETED';
      match.completedAt = new Date();
      if (match.nextMatchId) {
        const next = await this.matchesRepo.findOne({ where: { id: match.nextMatchId } });
        if (next) {
          if (!next.participant1Id) next.participant1Id = dto.winnerId;
          else next.participant2Id = dto.winnerId;
          await this.matchesRepo.save(next);
        }
      }
    }
    const saved = await this.matchesRepo.save(match);

    if (dto.winnerId) {
      this.auditLogger.record({
        actorId: organiserId, action: 'MATCH_RESULT_RECORDED', targetId: matchId, tournamentId, winnerId: dto.winnerId,
      });
    }

    // Publish match.completed event when a winner is recorded
    if (dto.winnerId && saved.participant1Id && saved.participant2Id) {
      const pMap = Object.fromEntries(t.participants.map((p: ParticipantEntity) => [p.id, p]));
      const p1 = pMap[saved.participant1Id];
      const p2 = pMap[saved.participant2Id];
      const winner = pMap[saved.winnerId];
      const loser = saved.winnerId === saved.participant1Id ? p2 : p1;

      const event = {
        matchId: saved.id,
        tournamentId: t.id,
        tournamentName: t.name,
        surface: t.surface,
        stage: saved.stage,
        round: saved.round,
        participant1Id: saved.participant1Id,
        participant2Id: saved.participant2Id,
        player1Id: p1?.playerId ?? saved.participant1Id,
        player2Id: p2?.playerId ?? saved.participant2Id,
        winnerId: saved.winnerId,
        winnerPlayerId: winner?.playerId ?? saved.winnerId,
        loserPlayerId: loser?.playerId ?? (saved.winnerId === saved.participant1Id ? saved.participant2Id : saved.participant1Id),
        sets: saved.sets ?? [],
      };

      this.statsClient.emit('match.completed', event);
      this.notificationsClient.emit('match.completed', event);
    }

    return saved;
  }

  health() { return { status: 'ok', service: 'tournament-service' }; }
}
