import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TournamentsService } from './tournaments.service';
import { TournamentEntity } from './entities/tournament.entity';
import { ParticipantEntity } from './entities/participant.entity';
import { TournamentMatchEntity } from './entities/match.entity';
import { TournamentGroupEntity } from './entities/group.entity';
import { AuditLogger } from '../audit/audit-logger.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _id = 0;
const uid = () => `id-${++_id}`;

function makeTournament(overrides: Partial<TournamentEntity> = {}): TournamentEntity {
  return Object.assign(
    {
      id: 'tournament-1',
      name: 'Test Open',
      organiserId: 'organiser-1',
      status: 'OPEN',
      drawFormat: 'SINGLE_ELIMINATION',
      maxParticipants: 32,
      minParticipants: 4,
      seeded: true,
      requiresApproval: false,
      participants: [],
      matches: [],
      groups: [],
      numberOfGroups: 4,
      advancePerGroup: 2,
      surface: 'CLAY',
      tournamentType: 'SINGLES_MEN',
    } as unknown as TournamentEntity,
    overrides,
  );
}

function makeParticipant(overrides: Partial<ParticipantEntity> = {}): ParticipantEntity {
  return Object.assign(
    {
      id: uid(),
      tournamentId: 'tournament-1',
      playerId: uid(),
      status: 'APPROVED',
      seed: null,
      groupId: null,
    } as unknown as ParticipantEntity,
    overrides,
  );
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('TournamentsService', () => {
  let service: TournamentsService;

  const mockTournamentsRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const mockParticipantsRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
  };
  const mockMatchesRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const mockGroupsRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const mockStatsClient = { emit: jest.fn() };
  const mockNotificationsClient = { emit: jest.fn() };
  const mockAuditLogger = { record: jest.fn() };
  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: { save: null as any },
  };
  const mockDataSource = { createQueryRunner: jest.fn(() => mockQueryRunner) };

  beforeEach(async () => {
    jest.clearAllMocks();
    _id = 0;
    mockQueryRunner.manager.save = mockMatchesRepo.save;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentsService,
        { provide: getRepositoryToken(TournamentEntity), useValue: mockTournamentsRepo },
        { provide: getRepositoryToken(ParticipantEntity), useValue: mockParticipantsRepo },
        { provide: getRepositoryToken(TournamentMatchEntity), useValue: mockMatchesRepo },
        { provide: getRepositoryToken(TournamentGroupEntity), useValue: mockGroupsRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: 'STATS_CLIENT', useValue: mockStatsClient },
        { provide: 'NOTIFICATIONS_CLIENT', useValue: mockNotificationsClient },
        { provide: AuditLogger, useValue: mockAuditLogger },
      ],
    }).compile();

    service = module.get<TournamentsService>(TournamentsService);
  });

  // ── CRUD ──────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns tournaments ordered by createdAt DESC', async () => {
      const list = [makeTournament()];
      mockTournamentsRepo.find.mockResolvedValue(list);

      const result = await service.findAll();

      expect(mockTournamentsRepo.find).toHaveBeenCalledWith({ order: { createdAt: 'DESC' } });
      expect(result).toBe(list);
    });
  });

  describe('findOne', () => {
    it('returns the tournament when found', async () => {
      const t = makeTournament();
      mockTournamentsRepo.findOne.mockResolvedValue(t);

      await expect(service.findOne('tournament-1')).resolves.toBe(t);
    });

    it('throws NotFoundException when tournament does not exist', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const baseDto = {
      name: 'Open',
      startDate: '2026-07-01',
      endDate: '2026-07-07',
      tournamentType: 'SINGLES_MEN',
      drawFormat: 'SINGLE_ELIMINATION',
      surface: 'CLAY',
    };

    it('creates tournament with DRAFT status and organiserId', async () => {
      mockTournamentsRepo.create.mockReturnValue(makeTournament({ status: 'DRAFT' }));
      mockTournamentsRepo.save.mockImplementation(async (t) => t);

      await service.create(baseDto as any, 'organiser-1');

      expect(mockTournamentsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ organiserId: 'organiser-1', status: 'DRAFT' }),
      );
    });

    it('applies default values when optional fields are omitted', async () => {
      mockTournamentsRepo.create.mockImplementation((data) => data);
      mockTournamentsRepo.save.mockImplementation(async (t) => t);

      const result = await service.create(baseDto as any, 'organiser-1');

      expect(result.maxParticipants).toBe(32);
      expect(result.minParticipants).toBe(4);
      expect(result.setsToWin).toBe(2);
      expect(result.gamesPerSet).toBe(6);
      expect(result.seeded).toBe(true);
      expect(result.isPublic).toBe(true);
      expect(result.requiresApproval).toBe(false);
    });
  });

  describe('update', () => {
    it('applies changes and saves for the organiser', async () => {
      const t = makeTournament();
      mockTournamentsRepo.findOne.mockResolvedValue(t);
      mockTournamentsRepo.save.mockImplementation(async (x) => x);

      await service.update('tournament-1', { name: 'Updated' }, 'organiser-1');

      expect(mockTournamentsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Updated' }),
      );
    });

    it('throws ForbiddenException when requester is not the organiser', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());

      await expect(service.update('tournament-1', {}, 'other')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('removes the tournament for the organiser', async () => {
      const t = makeTournament();
      mockTournamentsRepo.findOne.mockResolvedValue(t);
      mockTournamentsRepo.remove.mockResolvedValue(undefined);

      await service.remove('tournament-1', 'organiser-1');

      expect(mockTournamentsRepo.remove).toHaveBeenCalledWith(t);
    });

    it('throws ForbiddenException when requester is not the organiser', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());

      await expect(service.remove('tournament-1', 'other')).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when the tournament is IN_PROGRESS', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament({ status: 'IN_PROGRESS' }));

      await expect(service.remove('tournament-1', 'organiser-1')).rejects.toThrow(BadRequestException);
      expect(mockTournamentsRepo.remove).not.toHaveBeenCalled();
    });

    it('allows removing a COMPLETED tournament', async () => {
      const t = makeTournament({ status: 'COMPLETED' });
      mockTournamentsRepo.findOne.mockResolvedValue(t);
      mockTournamentsRepo.remove.mockResolvedValue(undefined);

      await service.remove('tournament-1', 'organiser-1');

      expect(mockTournamentsRepo.remove).toHaveBeenCalledWith(t);
    });
  });

  describe('open', () => {
    it('sets tournament status to OPEN', async () => {
      const t = makeTournament({ status: 'DRAFT' });
      mockTournamentsRepo.findOne.mockResolvedValue(t);
      mockTournamentsRepo.save.mockImplementation(async (x) => x);

      const result = await service.open('tournament-1', 'organiser-1');

      expect(result.status).toBe('OPEN');
    });

    it('throws ForbiddenException for non-organiser', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament({ status: 'DRAFT' }));

      await expect(service.open('tournament-1', 'other')).rejects.toThrow(ForbiddenException);
    });

    it.each(['OPEN', 'IN_PROGRESS', 'COMPLETED'])(
      'throws BadRequestException when tournament is already %s',
      async (status) => {
        mockTournamentsRepo.findOne.mockResolvedValue(makeTournament({ status: status as any }));

        await expect(service.open('tournament-1', 'organiser-1')).rejects.toThrow(BadRequestException);
        expect(mockTournamentsRepo.save).not.toHaveBeenCalled();
      },
    );
  });

  // ── PARTICIPANTS ───────────────────────────────────────────────────────────

  describe('enroll', () => {
    it('throws BadRequestException when tournament is not OPEN', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament({ status: 'DRAFT' }));

      await expect(service.enroll('tournament-1', { playerId: 'p1' }, 'p1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when tournament is full', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament({ maxParticipants: 4 }));
      mockParticipantsRepo.count.mockResolvedValue(4);

      await expect(service.enroll('tournament-1', { playerId: 'p1' }, 'p1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when player is already enrolled', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockParticipantsRepo.count.mockResolvedValue(0);
      mockParticipantsRepo.findOne.mockResolvedValue(makeParticipant());

      await expect(service.enroll('tournament-1', { playerId: 'p1' }, 'p1')).rejects.toThrow(BadRequestException);
    });

    it('sets status to APPROVED when requiresApproval is false', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament({ requiresApproval: false }));
      mockParticipantsRepo.count.mockResolvedValue(0);
      mockParticipantsRepo.findOne.mockResolvedValue(null);
      mockParticipantsRepo.create.mockImplementation((data) => data);
      mockParticipantsRepo.save.mockImplementation(async (p) => p);

      const result = await service.enroll('tournament-1', { playerId: 'p1' }, 'p1');

      expect(result.status).toBe('APPROVED');
    });

    it('sets status to PENDING when requiresApproval is true', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament({ requiresApproval: true }));
      mockParticipantsRepo.count.mockResolvedValue(0);
      mockParticipantsRepo.findOne.mockResolvedValue(null);
      mockParticipantsRepo.create.mockImplementation((data) => data);
      mockParticipantsRepo.save.mockImplementation(async (p) => p);

      const result = await service.enroll('tournament-1', { playerId: 'p1' }, 'p1');

      expect(result.status).toBe('PENDING');
    });

    it('throws ForbiddenException when requester enrolls a different player', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());

      await expect(service.enroll('tournament-1', { playerId: 'p1' }, 'someone-else')).rejects.toThrow(ForbiddenException);
    });

    it('allows the tournament organiser to enroll another player', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament({ organiserId: 'organiser-1' }));
      mockParticipantsRepo.count.mockResolvedValue(0);
      mockParticipantsRepo.findOne.mockResolvedValue(null);
      mockParticipantsRepo.create.mockImplementation((data) => data);
      mockParticipantsRepo.save.mockImplementation(async (p) => p);

      const result = await service.enroll('tournament-1', { playerId: 'p1' }, 'organiser-1');

      expect(result.status).toBe('APPROVED');
    });
  });

  describe('approveParticipant', () => {
    it('sets participant status to APPROVED', async () => {
      const participant = makeParticipant({ status: 'PENDING' });
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockParticipantsRepo.findOne.mockResolvedValue(participant);
      mockParticipantsRepo.save.mockImplementation(async (p) => p);

      const result = await service.approveParticipant('tournament-1', participant.id, 'organiser-1');

      expect(result.status).toBe('APPROVED');
    });

    it('throws ForbiddenException for non-organiser', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());

      await expect(
        service.approveParticipant('tournament-1', 'p', 'other'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when participant does not exist', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockParticipantsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.approveParticipant('tournament-1', 'missing', 'organiser-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('rejectParticipant', () => {
    it('sets participant status to REJECTED', async () => {
      const participant = makeParticipant({ status: 'PENDING' });
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockParticipantsRepo.findOne.mockResolvedValue(participant);
      mockParticipantsRepo.save.mockImplementation(async (p) => p);

      const result = await service.rejectParticipant('tournament-1', participant.id, 'organiser-1');

      expect(result.status).toBe('REJECTED');
    });

    it('throws ForbiddenException for non-organiser', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());

      await expect(
        service.rejectParticipant('tournament-1', 'p', 'other'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('withdrawParticipant', () => {
    it('organiser can withdraw any participant', async () => {
      const participant = makeParticipant({ playerId: 'player-99' });
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockParticipantsRepo.findOne.mockResolvedValue(participant);
      mockParticipantsRepo.save.mockImplementation(async (p) => p);

      const result = await service.withdrawParticipant('tournament-1', participant.id, 'organiser-1', true);

      expect(result.status).toBe('WITHDRAWN');
    });

    it('player can withdraw themselves', async () => {
      const participant = makeParticipant({ playerId: 'player-1' });
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockParticipantsRepo.findOne.mockResolvedValue(participant);
      mockParticipantsRepo.save.mockImplementation(async (p) => p);

      const result = await service.withdrawParticipant('tournament-1', participant.id, 'player-1', false);

      expect(result.status).toBe('WITHDRAWN');
    });

    it('throws ForbiddenException when player tries to withdraw another player', async () => {
      const participant = makeParticipant({ playerId: 'player-99' });
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockParticipantsRepo.findOne.mockResolvedValue(participant);

      await expect(
        service.withdrawParticipant('tournament-1', participant.id, 'player-1', false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when participant does not exist', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockParticipantsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.withdrawParticipant('tournament-1', 'missing', 'organiser-1', true),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('assignSeed', () => {
    it('assigns the seed to the participant', async () => {
      const participant = makeParticipant({ seed: null });
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockParticipantsRepo.findOne.mockResolvedValue(participant);
      mockParticipantsRepo.save.mockImplementation(async (p) => p);

      const result = await service.assignSeed('tournament-1', participant.id, 3, 'organiser-1');

      expect(result.seed).toBe(3);
    });

    it('throws ForbiddenException for non-organiser', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());

      await expect(
        service.assignSeed('tournament-1', 'p', 1, 'other'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── GENERATE DRAW — guards ─────────────────────────────────────────────────

  describe('generateDraw guards', () => {
    it('throws ForbiddenException when requester is not the organiser', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());

      await expect(service.generateDraw('tournament-1', 'other')).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when tournament is not OPEN', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament({ status: 'DRAFT' }));

      await expect(service.generateDraw('tournament-1', 'organiser-1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when approved participant count is below minimum', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament({ minParticipants: 4 }));
      mockParticipantsRepo.find.mockResolvedValue([makeParticipant(), makeParticipant()]);
      mockMatchesRepo.delete.mockResolvedValue(undefined);
      mockGroupsRepo.delete.mockResolvedValue(undefined);

      await expect(service.generateDraw('tournament-1', 'organiser-1')).rejects.toThrow(BadRequestException);
    });

    it('sets tournament status to IN_PROGRESS after draw generation', async () => {
      const participants = [1, 2, 3, 4].map((seed) => makeParticipant({ seed }));
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockParticipantsRepo.find.mockResolvedValue(participants);
      mockMatchesRepo.delete.mockResolvedValue(undefined);
      mockGroupsRepo.delete.mockResolvedValue(undefined);
      mockMatchesRepo.save.mockImplementation(async (m) => m);
      mockTournamentsRepo.update.mockResolvedValue(undefined);

      const result = await service.generateDraw('tournament-1', 'organiser-1');

      expect(mockTournamentsRepo.update).toHaveBeenCalledWith('tournament-1', { status: 'IN_PROGRESS' });
      expect(result.tournament.status).toBe('IN_PROGRESS');
    });

    it('clears existing matches and groups before regenerating the draw', async () => {
      const participants = [1, 2, 3, 4].map((seed) => makeParticipant({ seed }));
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockParticipantsRepo.find.mockResolvedValue(participants);
      mockMatchesRepo.delete.mockResolvedValue(undefined);
      mockGroupsRepo.delete.mockResolvedValue(undefined);
      mockMatchesRepo.save.mockImplementation(async (m) => m);
      mockTournamentsRepo.update.mockResolvedValue(undefined);

      await service.generateDraw('tournament-1', 'organiser-1');

      expect(mockMatchesRepo.delete).toHaveBeenCalledWith({ tournamentId: 'tournament-1' });
      expect(mockGroupsRepo.delete).toHaveBeenCalledWith({ tournamentId: 'tournament-1' });
    });
  });

  // ── SINGLE ELIMINATION ─────────────────────────────────────────────────────

  describe('generateDraw — SINGLE_ELIMINATION', () => {
    const run = async (participants: ParticipantEntity[]) => {
      const tournament = makeTournament({ drawFormat: 'SINGLE_ELIMINATION', seeded: true });
      mockTournamentsRepo.findOne.mockResolvedValue(tournament);
      mockParticipantsRepo.find.mockResolvedValue(participants);
      mockMatchesRepo.delete.mockResolvedValue(undefined);
      mockGroupsRepo.delete.mockResolvedValue(undefined);
      mockMatchesRepo.save.mockImplementation(async (m) => m);
      mockTournamentsRepo.update.mockResolvedValue(undefined);
      return service.generateDraw('tournament-1', 'organiser-1');
    };

    it('creates 3 matches for 4 players (2 in R1, 1 Final)', async () => {
      const { matches } = await run([1, 2, 3, 4].map((s) => makeParticipant({ seed: s })));

      expect(matches.length).toBe(3);
      expect(matches.filter((m) => m.round === 1).length).toBe(2);
      expect(matches.filter((m) => m.round === 2).length).toBe(1);
    });

    it('creates 7 matches for 8 players (4+2+1)', async () => {
      const { matches } = await run([1, 2, 3, 4, 5, 6, 7, 8].map((s) => makeParticipant({ seed: s })));

      expect(matches.length).toBe(7);
    });

    it('links nextMatchId: every R1 match points to the correct R2 match', async () => {
      const { matches } = await run([1, 2, 3, 4].map((s) => makeParticipant({ seed: s })));

      const final = matches.find((m) => m.round === 2);
      for (const m of matches.filter((m) => m.round === 1)) {
        expect(m.nextMatchId).toBe(final.id);
      }
    });

    it('places seed 1 vs seed 4 and seed 2 vs seed 3 in correct positions', async () => {
      // seededSlots(4) = [0,3,1,2]
      // → R1[pos=0]: ord[0]=seed1 vs ord[3]=seed4
      // → R1[pos=1]: ord[1]=seed2 vs ord[2]=seed3
      const participants = [1, 2, 3, 4].map((s) => makeParticipant({ id: `p${s}`, seed: s }));
      const { matches } = await run(participants);

      const r1 = matches.filter((m) => m.round === 1).sort((a, b) => a.position - b.position);
      expect(r1[0].participant1Id).toBe('p1');
      expect(r1[0].participant2Id).toBe('p4');
      expect(r1[1].participant1Id).toBe('p2');
      expect(r1[1].participant2Id).toBe('p3');
    });

    it('creates exactly one BYE match when player count is not a power of 2', async () => {
      const { matches } = await run([1, 2, 3].map((s) => makeParticipant({ seed: s })));

      const byeMatches = matches.filter((m) => m.status === 'BYE');
      expect(byeMatches.length).toBe(1);
      expect(byeMatches[0].participant2Id).toBeFalsy();
      expect(byeMatches[0].winnerId).toBeTruthy();
    });

    it('auto-advances BYE winner into the next round match', async () => {
      const { matches } = await run([1, 2, 3].map((s) => makeParticipant({ seed: s })));

      const bye = matches.find((m) => m.status === 'BYE');
      const next = matches.find((m) => m.id === bye.nextMatchId);
      const advancedId = next.participant1Id ?? next.participant2Id;
      expect(advancedId).toBe(bye.winnerId);
    });

    it('all non-BYE R1 matches have status SCHEDULED', async () => {
      const { matches } = await run([1, 2, 3, 4].map((s) => makeParticipant({ seed: s })));

      for (const m of matches.filter((m) => m.round === 1)) {
        expect(m.status).toBe('SCHEDULED');
      }
    });
  });

  // ── ROUND ROBIN ────────────────────────────────────────────────────────────

  describe('generateDraw — ROUND_ROBIN', () => {
    const run = async (n: number) => {
      const participants = Array.from({ length: n }, (_, i) => makeParticipant({ seed: i + 1 }));
      const tournament = makeTournament({ drawFormat: 'ROUND_ROBIN', seeded: true });
      mockTournamentsRepo.findOne.mockResolvedValue(tournament);
      mockParticipantsRepo.find.mockResolvedValue(participants);
      mockMatchesRepo.delete.mockResolvedValue(undefined);
      mockGroupsRepo.delete.mockResolvedValue(undefined);
      mockMatchesRepo.save.mockImplementation(async (m) => m);
      mockTournamentsRepo.update.mockResolvedValue(undefined);
      return service.generateDraw('tournament-1', 'organiser-1');
    };

    it('creates n*(n-1)/2 matches for n participants', async () => {
      const { matches } = await run(5);
      expect(matches.length).toBe(10); // 5*4/2
    });

    it('every match has both participants assigned and status SCHEDULED', async () => {
      const { matches } = await run(4);

      for (const m of matches) {
        expect(m.participant1Id).toBeTruthy();
        expect(m.participant2Id).toBeTruthy();
        expect(m.status).toBe('SCHEDULED');
      }
    });

    it('every pair of participants plays exactly once', async () => {
      const { matches } = await run(4);

      const pairKeys = matches.map((m) =>
        [m.participant1Id, m.participant2Id].sort().join('|'),
      );
      const unique = new Set(pairKeys);
      expect(unique.size).toBe(matches.length);
    });

    it('all matches are round 1 — Round Robin has no round grouping', async () => {
      const { matches } = await run(5);

      expect(matches.every((m) => m.round === 1)).toBe(true);
    });
  });

  // ── GROUP STAGE ────────────────────────────────────────────────────────────

  describe('generateDraw — GROUP_STAGE_KNOCKOUT', () => {
    const run = async (numPlayers: number, numGroups: number, advancePerGroup: number) => {
      const participants = Array.from({ length: numPlayers }, (_, i) =>
        makeParticipant({ id: `p${i + 1}` }),
      );
      const tournament = makeTournament({
        drawFormat: 'GROUP_STAGE_KNOCKOUT',
        numberOfGroups: numGroups,
        advancePerGroup,
        seeded: false,
      });
      mockTournamentsRepo.findOne.mockResolvedValue(tournament);
      mockParticipantsRepo.find.mockResolvedValue(participants);
      mockMatchesRepo.delete.mockResolvedValue(undefined);
      mockGroupsRepo.delete.mockResolvedValue(undefined);

      let gCounter = 0;
      mockGroupsRepo.create.mockImplementation((data) => ({ ...data, id: `group-${++gCounter}` }));
      mockGroupsRepo.save.mockImplementation(async (g) => g);
      mockParticipantsRepo.save.mockImplementation(async (p) => p);
      mockMatchesRepo.save.mockImplementation(async (m) => m);
      mockTournamentsRepo.update.mockResolvedValue(undefined);

      return service.generateDraw('tournament-1', 'organiser-1');
    };

    it('creates the correct number of groups', async () => {
      await run(8, 2, 2);

      expect(mockGroupsRepo.create).toHaveBeenCalledTimes(2);
    });

    it('creates round-robin GROUP matches and KNOCKOUT matches', async () => {
      // 8 players, 2 groups of 4 → 6 matches per group = 12 GROUP matches
      // 4 advance → 2 SF + 1 Final = 3 KNOCKOUT matches
      const { matches } = await run(8, 2, 2);

      expect(matches.filter((m) => m.stage === 'GROUP').length).toBe(12);
      expect(matches.filter((m) => m.stage === 'KNOCKOUT').length).toBe(3);
    });

    it('all GROUP matches have a groupId assigned', async () => {
      const { matches } = await run(8, 2, 2);

      for (const m of matches.filter((m) => m.stage === 'GROUP')) {
        expect(m.groupId).toBeTruthy();
      }
    });

    it('R1 knockout matches have slot labels (e.g. "A1", "B2")', async () => {
      const { matches } = await run(8, 2, 2);

      const r1KO = matches.filter((m) => m.stage === 'KNOCKOUT' && m.round === 1);
      for (const m of r1KO) {
        expect(m.slot1).toMatch(/^[A-Z]\d+$/);
        expect(m.slot2).toMatch(/^[A-Z]\d+$/);
      }
    });

    it('knockout matches are linked via nextMatchId', async () => {
      const { matches } = await run(8, 2, 2);

      const koR1 = matches.filter((m) => m.stage === 'KNOCKOUT' && m.round === 1);
      for (const m of koR1) {
        expect(m.nextMatchId).toBeTruthy();
      }
    });
  });

  // ── DRAW MANAGEMENT ────────────────────────────────────────────────────────

  describe('swapParticipants', () => {
    it('swaps participant IDs across all affected matches', async () => {
      const matches = [
        { id: 'm1', participant1Id: 'pA', participant2Id: 'pB', tournamentId: 'tournament-1' },
        { id: 'm2', participant1Id: 'pC', participant2Id: 'pA', tournamentId: 'tournament-1' },
      ] as TournamentMatchEntity[];

      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockMatchesRepo.find.mockResolvedValue(matches);
      mockMatchesRepo.save.mockImplementation(async (m) => m);

      await service.swapParticipants(
        'tournament-1',
        { participantId1: 'pA', participantId2: 'pB' },
        'organiser-1',
      );

      const savedM1 = mockMatchesRepo.save.mock.calls.find((c) => c[0].id === 'm1')?.[0];
      expect(savedM1.participant1Id).toBe('pB');
      expect(savedM1.participant2Id).toBe('pA');
    });

    it('throws ForbiddenException for non-organiser', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());

      await expect(
        service.swapParticipants('tournament-1', { participantId1: 'a', participantId2: 'b' }, 'other'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateDrawSlot', () => {
    const setup = (matchOverrides: Partial<TournamentMatchEntity> = {}) => {
      const match = Object.assign(
        {
          id: 'm1',
          tournamentId: 'tournament-1',
          participant1Id: null,
          participant2Id: null,
          status: 'SCHEDULED',
        } as unknown as TournamentMatchEntity,
        matchOverrides,
      );
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockMatchesRepo.findOne.mockResolvedValue(match);
      mockMatchesRepo.save.mockImplementation(async (m) => m);
      return match;
    };

    it('sets participant1Id and status SCHEDULED when both slots become filled', async () => {
      setup({ participant2Id: 'pB' });

      const result = await service.updateDrawSlot('tournament-1', 'm1', 'participant1Id', 'pA', 'organiser-1');

      expect(result.participant1Id).toBe('pA');
      expect(result.status).toBe('SCHEDULED');
    });

    it('sets status BYE when only participant1Id is set', async () => {
      setup();

      const result = await service.updateDrawSlot('tournament-1', 'm1', 'participant1Id', 'pA', 'organiser-1');

      expect(result.status).toBe('BYE');
    });

    it('throws BadRequestException for an invalid slot name', async () => {
      setup();

      await expect(
        service.updateDrawSlot('tournament-1', 'm1', 'badSlot', 'pA', 'organiser-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when match does not exist', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockMatchesRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateDrawSlot('tournament-1', 'missing', 'participant1Id', 'pA', 'organiser-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── UPDATE MATCH ───────────────────────────────────────────────────────────

  describe('updateMatch', () => {
    const p1 = makeParticipant({ id: 'part1', playerId: 'player1' });
    const p2 = makeParticipant({ id: 'part2', playerId: 'player2' });

    const setupMatch = (matchOverrides: Partial<TournamentMatchEntity> = {}) => {
      const tournament = makeTournament({ participants: [p1, p2] });
      const match = Object.assign(
        {
          id: 'match-1',
          tournamentId: 'tournament-1',
          participant1Id: 'part1',
          participant2Id: 'part2',
          round: 1,
          position: 0,
          stage: 'KNOCKOUT',
          status: 'SCHEDULED',
          nextMatchId: 'match-next',
          sets: [],
          winnerId: null,
          groupId: null,
          slot1: null,
          slot2: null,
          scheduledAt: null,
          completedAt: null,
        } as unknown as TournamentMatchEntity,
        matchOverrides,
      );

      mockTournamentsRepo.findOne.mockResolvedValue(tournament);
      mockMatchesRepo.findOne.mockImplementation(async ({ where }) => {
        if (where.id === 'match-1') return match;
        if (where.id === 'match-next') return { id: 'match-next', participant1Id: null, participant2Id: null };
        return null;
      });
      mockMatchesRepo.save.mockImplementation(async (m) => m);

      return { tournament, match };
    };

    it('updates sets and status without recording a winner', async () => {
      setupMatch();

      const result = await service.updateMatch(
        'tournament-1',
        'match-1',
        { sets: [{ p1: 6, p2: 3 }], status: 'IN_PROGRESS' },
        'organiser-1',
      );

      expect(result.sets).toEqual([{ p1: 6, p2: 3 }]);
      expect(result.status).toBe('IN_PROGRESS');
    });

    it('sets status to COMPLETED and records completedAt when winnerId is provided', async () => {
      setupMatch();

      const result = await service.updateMatch('tournament-1', 'match-1', { winnerId: 'part1' }, 'organiser-1');

      expect(result.status).toBe('COMPLETED');
      expect(result.completedAt).toBeTruthy();
      expect(result.winnerId).toBe('part1');
    });

    it('advances winner to participant1Id of next match when that slot is empty', async () => {
      setupMatch();

      await service.updateMatch('tournament-1', 'match-1', { winnerId: 'part1' }, 'organiser-1');

      const nextSave = mockMatchesRepo.save.mock.calls.find((c) => c[0].id === 'match-next')?.[0];
      expect(nextSave.participant1Id).toBe('part1');
    });

    it('advances winner to participant2Id of next match when participant1Id is already taken', async () => {
      const tournament = makeTournament({ participants: [p1, p2] });
      const match = {
        id: 'match-1', tournamentId: 'tournament-1',
        participant1Id: 'part1', participant2Id: 'part2',
        round: 1, position: 0, stage: 'KNOCKOUT', status: 'SCHEDULED',
        nextMatchId: 'match-next', sets: [], winnerId: null,
      } as unknown as TournamentMatchEntity;

      mockTournamentsRepo.findOne.mockResolvedValue(tournament);
      mockMatchesRepo.findOne.mockImplementation(async ({ where }) => {
        if (where.id === 'match-1') return match;
        if (where.id === 'match-next') return { id: 'match-next', participant1Id: 'part-other', participant2Id: null };
        return null;
      });
      mockMatchesRepo.save.mockImplementation(async (m) => m);

      await service.updateMatch('tournament-1', 'match-1', { winnerId: 'part1' }, 'organiser-1');

      const nextSave = mockMatchesRepo.save.mock.calls.find((c) => c[0].id === 'match-next')?.[0];
      expect(nextSave.participant2Id).toBe('part1');
    });

    it('runs both saves inside a single transaction', async () => {
      setupMatch();

      await service.updateMatch('tournament-1', 'match-1', { winnerId: 'part1' }, 'organiser-1');

      expect(mockDataSource.createQueryRunner).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('rolls back and does not advance the winner if the second save fails', async () => {
      setupMatch();
      mockQueryRunner.manager.save = jest.fn()
        .mockResolvedValueOnce({ id: 'match-1' }) // match save succeeds
        .mockRejectedValueOnce(new Error('db exploded')); // next-match save fails

      await expect(
        service.updateMatch('tournament-1', 'match-1', { winnerId: 'part1' }, 'organiser-1'),
      ).rejects.toThrow('db exploded');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('emits match.completed to both stats and notifications clients', async () => {
      setupMatch();

      await service.updateMatch('tournament-1', 'match-1', { winnerId: 'part1' }, 'organiser-1');

      expect(mockStatsClient.emit).toHaveBeenCalledWith(
        'match.completed',
        expect.objectContaining({ matchId: 'match-1', tournamentId: 'tournament-1', winnerId: 'part1' }),
      );
      expect(mockNotificationsClient.emit).toHaveBeenCalledWith('match.completed', expect.any(Object));
    });

    it('does NOT emit match.completed for a BYE (participant2Id is null)', async () => {
      const tournament = makeTournament({ participants: [p1] });
      const match = {
        id: 'match-1', tournamentId: 'tournament-1',
        participant1Id: 'part1', participant2Id: null,
        stage: 'KNOCKOUT', status: 'BYE', nextMatchId: null, sets: [], winnerId: null,
      } as unknown as TournamentMatchEntity;

      mockTournamentsRepo.findOne.mockResolvedValue(tournament);
      mockMatchesRepo.findOne.mockResolvedValue(match);
      mockMatchesRepo.save.mockImplementation(async (m) => m);

      await service.updateMatch('tournament-1', 'match-1', { winnerId: 'part1' }, 'organiser-1');

      expect(mockStatsClient.emit).not.toHaveBeenCalled();
      expect(mockNotificationsClient.emit).not.toHaveBeenCalled();
    });

    it('includes correct player IDs (not participant IDs) in the emitted event', async () => {
      setupMatch();

      await service.updateMatch('tournament-1', 'match-1', { winnerId: 'part1' }, 'organiser-1');

      expect(mockStatsClient.emit).toHaveBeenCalledWith(
        'match.completed',
        expect.objectContaining({
          player1Id: 'player1',
          player2Id: 'player2',
          winnerPlayerId: 'player1',
          loserPlayerId: 'player2',
        }),
      );
    });

    it('throws ForbiddenException for non-organiser', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());

      await expect(service.updateMatch('tournament-1', 'match-1', {}, 'other')).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when match does not exist', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockMatchesRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateMatch('tournament-1', 'missing', {}, 'organiser-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
