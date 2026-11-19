import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TournamentsService } from './tournaments.service';
import { TournamentEntity } from './entities/tournament.entity';
import { ParticipantEntity } from './entities/participant.entity';
import { TournamentMatchEntity } from './entities/match.entity';
import { TournamentGroupEntity } from './entities/group.entity';
import { AuditLogger } from '../audit/audit-logger.service';
import { UpdateMatchDto } from './dto/update-match.dto';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { AssignSeedDto } from './dto/assign-seed.dto';

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

  describe('findAll (B-21 visibility)', () => {
    const list = () => [
      makeTournament({ id: 't-open', organiserId: 'someone', status: 'OPEN' }),
      makeTournament({ id: 't-draft-other', organiserId: 'someone', status: 'DRAFT' }),
      makeTournament({ id: 't-draft-mine', organiserId: 'me', status: 'DRAFT' }),
      makeTournament({ id: 't-private', organiserId: 'someone', status: 'OPEN', isPublic: false }),
      makeTournament({ id: 't-private-entered', organiserId: 'someone', status: 'OPEN', isPublic: false }),
      makeTournament({ id: 't-done', organiserId: 'someone', status: 'COMPLETED' }),
      makeTournament({ id: 't-done-entered', organiserId: 'someone', status: 'COMPLETED' }),
      makeTournament({ id: 't-cancelled', organiserId: 'someone', status: 'CANCELLED' }),
    ];
    const ids = (r: TournamentEntity[]) => r.map((t) => t.id);
    beforeEach(() => {
      mockTournamentsRepo.find.mockResolvedValue(list());
      mockParticipantsRepo.find.mockResolvedValue([
        { tournamentId: 't-private-entered' }, { tournamentId: 't-done-entered' },
      ]);
    });

    it('asks for newest first', async () => {
      await service.findAll();
      expect(mockTournamentsRepo.find).toHaveBeenCalledWith({ order: { createdAt: 'DESC' } });
    });

    it('anonymous: no drafts, no private, no finished or cancelled', async () => {
      expect(ids(await service.findAll())).toEqual(['t-open']);
    });

    it("signed in: also my own drafts and everything I've entered", async () => {
      expect(ids(await service.findAll('me'))).toEqual(['t-open', 't-draft-mine', 't-private-entered', 't-done-entered']);
    });

    it("never returns another organiser's DRAFT, even when asked by status", async () => {
      expect(ids(await service.findAll('me', 'DRAFT'))).toEqual(['t-draft-mine']);
    });

    it('?status= brings back completed and cancelled tournaments', async () => {
      expect(ids(await service.findAll(undefined, 'completed,CANCELLED'))).toEqual(['t-done', 't-done-entered', 't-cancelled']);
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

    it('refuses format changes once the tournament is OPEN', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament({ status: 'OPEN' } as any));

      await expect(
        service.update('tournament-1', { drawFormat: 'ROUND_ROBIN' }, 'organiser-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows format changes while DRAFT', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament({ status: 'DRAFT' } as any));
      mockTournamentsRepo.save.mockImplementation(async (x) => x);

      await service.update('tournament-1', { drawFormat: 'ROUND_ROBIN' }, 'organiser-1');

      expect(mockTournamentsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ drawFormat: 'ROUND_ROBIN' }),
      );
    });

    it('refuses any edit once play has started', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament({ status: 'IN_PROGRESS' } as any));

      await expect(
        service.update('tournament-1', { name: 'x' }, 'organiser-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an end date before the start date with 400, not 500', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament({ status: 'DRAFT' } as any));

      await expect(
        service.update('tournament-1', { startDate: '2026-06-10', endDate: '2026-06-01' }, 'organiser-1'),
      ).rejects.toThrow(BadRequestException);
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
    it('the tournament owner can withdraw any participant', async () => {
      const participant = makeParticipant({ playerId: 'player-99' });
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockParticipantsRepo.findOne.mockResolvedValue(participant);
      mockParticipantsRepo.save.mockImplementation(async (p) => p);

      const result = await service.withdrawParticipant('tournament-1', participant.id, 'organiser-1');

      expect(result.status).toBe('WITHDRAWN');
    });

    it("an organiser of another tournament cannot withdraw players from this one", async () => {
      const participant = makeParticipant({ playerId: 'player-99' });
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockParticipantsRepo.findOne.mockResolvedValue(participant);

      await expect(
        service.withdrawParticipant('tournament-1', participant.id, 'other-organiser'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockParticipantsRepo.save).not.toHaveBeenCalled();
    });

    it('player can withdraw themselves', async () => {
      const participant = makeParticipant({ playerId: 'player-1' });
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockParticipantsRepo.findOne.mockResolvedValue(participant);
      mockParticipantsRepo.save.mockImplementation(async (p) => p);

      const result = await service.withdrawParticipant('tournament-1', participant.id, 'player-1');

      expect(result.status).toBe('WITHDRAWN');
    });

    it('throws ForbiddenException when player tries to withdraw another player', async () => {
      const participant = makeParticipant({ playerId: 'player-99' });
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockParticipantsRepo.findOne.mockResolvedValue(participant);

      await expect(
        service.withdrawParticipant('tournament-1', participant.id, 'player-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when participant does not exist', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockParticipantsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.withdrawParticipant('tournament-1', 'missing', 'organiser-1'),
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
      const { matches } = await run([1, 2, 3, 4, 5, 6, 7].map((s) => makeParticipant({ seed: s })));

      const byeMatches = matches.filter((m) => m.status === 'BYE');
      expect(byeMatches.length).toBe(1);
      expect(byeMatches[0].participant2Id).toBeFalsy();
      expect(byeMatches[0].winnerId).toBeTruthy();
    });

    it('auto-advances BYE winner into the next round match', async () => {
      const { matches } = await run([1, 2, 3, 4, 5, 6, 7].map((s) => makeParticipant({ seed: s })));

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

      expect(mockMatchesRepo.save).toHaveBeenCalledTimes(1);
      const savedBatch = mockMatchesRepo.save.mock.calls[0][0];
      const savedM1 = savedBatch.find((m) => m.id === 'm1');
      expect(savedM1.participant1Id).toBe('pB');
      expect(savedM1.participant2Id).toBe('pA');
    });

    it('saves all affected matches in a single batched call', async () => {
      const matches = [
        { id: 'm1', participant1Id: 'pA', participant2Id: 'pB', tournamentId: 'tournament-1' },
        { id: 'm2', participant1Id: 'pC', participant2Id: 'pA', tournamentId: 'tournament-1' },
        { id: 'm3', participant1Id: 'pX', participant2Id: 'pY', tournamentId: 'tournament-1' },
      ] as TournamentMatchEntity[];

      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockMatchesRepo.find.mockResolvedValue(matches);
      mockMatchesRepo.save.mockImplementation(async (m) => m);

      await service.swapParticipants(
        'tournament-1',
        { participantId1: 'pA', participantId2: 'pB' },
        'organiser-1',
      );

      expect(mockMatchesRepo.save).toHaveBeenCalledTimes(1);
      expect(mockMatchesRepo.save.mock.calls[0][0]).toHaveLength(2); // m3 is unaffected
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
      mockMatchesRepo.find.mockResolvedValue([match]);
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

  // ── Sprint 1: validation, state machine, draw config ───────────────────────

  describe('DTO validation (B-14, B-17)', () => {
    const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const later = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const base = () => ({
      name: 'Spring Open', startDate: tomorrow(), endDate: later(3),
      tournamentType: 'SINGLES_MEN', drawFormat: 'SINGLE_ELIMINATION', surface: 'CLAY',
    });
    const errorsFor = async (cls: any, body: any) => {
      const { plainToInstance } = await import('class-transformer');
      const { validate } = await import('class-validator');
      return (await validate(plainToInstance(cls, body))).map((e) => e.property);
    };

    it('accepts a sensible tournament and trims the name', async () => {
      const { plainToInstance } = await import('class-transformer');
      expect(await errorsFor(CreateTournamentDto, base())).toEqual([]);
      expect(plainToInstance(CreateTournamentDto, { ...base(), name: '  Spring Open  ' }).name).toBe('Spring Open');
    });
    it('rejects a whitespace-only name', async () => {
      expect(await errorsFor(CreateTournamentDto, { ...base(), name: '   ' })).toEqual(['name']);
    });
    it('rejects a 5000-character name', async () => {
      expect(await errorsFor(CreateTournamentDto, { ...base(), name: 'x'.repeat(5000) })).toEqual(['name']);
    });
    it('rejects an end date before the start date', async () => {
      expect(await errorsFor(CreateTournamentDto, { ...base(), startDate: later(5), endDate: later(2) })).toEqual(['endDate']);
    });
    it('rejects a start date in the past', async () => {
      expect(await errorsFor(CreateTournamentDto, { ...base(), startDate: '2020-01-01' })).toContain('startDate');
    });
    it('rejects a registration deadline after the start', async () => {
      expect(await errorsFor(CreateTournamentDto, { ...base(), registrationDeadline: later(2) })).toEqual(['registrationDeadline']);
    });
    it('rejects a minimum above the maximum (explicit or default 32)', async () => {
      expect(await errorsFor(CreateTournamentDto, { ...base(), maxParticipants: 8, minParticipants: 9 })).toEqual(['minParticipants']);
      expect(await errorsFor(CreateTournamentDto, { ...base(), minParticipants: 40 })).toEqual(['minParticipants']);
    });
    it('rejects Double Elimination and doubles until they are implemented', async () => {
      expect(await errorsFor(CreateTournamentDto, { ...base(), drawFormat: 'DOUBLE_ELIMINATION' })).toEqual(['drawFormat']);
      expect(await errorsFor(CreateTournamentDto, { ...base(), tournamentType: 'MIXED_DOUBLES' })).toEqual(['tournamentType']);
      expect(await errorsFor(UpdateTournamentDto, { drawFormat: 'DOUBLE_ELIMINATION' })).toEqual(['drawFormat']);
    });
    it('the seed DTO rejects text, zero and negatives but allows null to clear', async () => {
      expect(await errorsFor(AssignSeedDto, { seed: 'abc' })).toEqual(['seed']);
      expect(await errorsFor(AssignSeedDto, { seed: 0 })).toEqual(['seed']);
      expect(await errorsFor(AssignSeedDto, { seed: -2 })).toEqual(['seed']);
      expect(await errorsFor(AssignSeedDto, { seed: null })).toEqual([]);
      expect(await errorsFor(AssignSeedDto, {})).toEqual(['seed']);
    });
  });

  describe('update cross-field rules (B-14)', () => {
    beforeEach(() => mockTournamentsRepo.save.mockImplementation(async (t) => t));
    const t = () => makeTournament({ status: 'DRAFT', startDate: '2099-05-10', endDate: '2099-05-12', minParticipants: 4, maxParticipants: 8 } as any);

    it('rejects an endDate before the stored startDate', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(t());
      await expect(service.update('tournament-1', { endDate: '2099-05-01' }, 'organiser-1')).rejects.toThrow('endDate');
    });
    it('rejects a deadline after the stored startDate', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(t());
      await expect(service.update('tournament-1', { registrationDeadline: '2099-05-11' }, 'organiser-1')).rejects.toThrow('registrationDeadline');
    });
    it('rejects a minimum above the stored maximum', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(t());
      await expect(service.update('tournament-1', { minParticipants: 16 }, 'organiser-1')).rejects.toThrow('minParticipants');
    });
  });

  describe('enroll deadline (B-14)', () => {
    beforeEach(() => {
      mockParticipantsRepo.count.mockResolvedValue(0);
      mockParticipantsRepo.findOne.mockResolvedValue(null);
      mockParticipantsRepo.create.mockImplementation((d) => d);
      mockParticipantsRepo.save.mockImplementation(async (p) => p);
    });

    it('refuses a player entering after the deadline', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament({ registrationDeadline: '2020-01-01' } as any));
      await expect(service.enroll('tournament-1', { playerId: 'player-1' }, 'player-1')).rejects.toThrow('Registration closed');
    });
    it('still lets the organiser add a late entry', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament({ registrationDeadline: '2020-01-01' } as any));
      await expect(service.enroll('tournament-1', { playerId: 'player-1' }, 'organiser-1')).resolves.toBeTruthy();
    });
    it('accepts entries on the deadline day itself', async () => {
      const today = new Date().toISOString().slice(0, 10);
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament({ registrationDeadline: today } as any));
      await expect(service.enroll('tournament-1', { playerId: 'player-1' }, 'player-1')).resolves.toBeTruthy();
    });
  });

  describe('participant state machine and capacity (B-11)', () => {
    beforeEach(() => {
      mockParticipantsRepo.save.mockImplementation(async (p) => p);
      mockParticipantsRepo.count.mockResolvedValue(0);
    });

    it.each(['APPROVED', 'REJECTED', 'WITHDRAWN'])('cannot approve an entry that is %s', async (status) => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockParticipantsRepo.findOne.mockResolvedValue(makeParticipant({ status: status as any }));
      await expect(service.approveParticipant('tournament-1', 'p', 'organiser-1')).rejects.toThrow('Only a pending entry');
    });

    it.each(['APPROVED', 'REJECTED', 'WITHDRAWN'])('cannot reject an entry that is %s', async (status) => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockParticipantsRepo.findOne.mockResolvedValue(makeParticipant({ status: status as any }));
      await expect(service.rejectParticipant('tournament-1', 'p', 'organiser-1')).rejects.toThrow('Only a pending entry');
    });

    it('refuses the 9th approval for 8 places', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament({ maxParticipants: 8 }));
      mockParticipantsRepo.findOne.mockResolvedValue(makeParticipant({ status: 'PENDING' }));
      mockParticipantsRepo.count.mockResolvedValue(8);
      await expect(service.approveParticipant('tournament-1', 'p', 'organiser-1')).rejects.toThrow('full (8/8');
      expect(mockParticipantsRepo.save).not.toHaveBeenCalled();
    });

    it('approves the 8th entry for 8 places', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament({ maxParticipants: 8 }));
      mockParticipantsRepo.findOne.mockResolvedValue(makeParticipant({ status: 'PENDING' }));
      mockParticipantsRepo.count.mockResolvedValue(7);
      expect((await service.approveParticipant('tournament-1', 'p', 'organiser-1')).status).toBe('APPROVED');
    });

    it('no approve or reject after the draw', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament({ status: 'IN_PROGRESS' }));
      mockParticipantsRepo.findOne.mockResolvedValue(makeParticipant({ status: 'PENDING' }));
      await expect(service.approveParticipant('tournament-1', 'p', 'organiser-1')).rejects.toThrow('locked');
      await expect(service.rejectParticipant('tournament-1', 'p', 'organiser-1')).rejects.toThrow('locked');
    });
  });

  describe('assignSeed rules (B-13)', () => {
    beforeEach(() => mockParticipantsRepo.save.mockImplementation(async (p) => p));

    it('rejects a seed above the entry maximum', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament({ maxParticipants: 8 }));
      mockParticipantsRepo.findOne.mockResolvedValue(makeParticipant({ id: 'pA' }));
      await expect(service.assignSeed('tournament-1', 'pA', 9, 'organiser-1')).rejects.toThrow('between 1 and 8');
    });
    it('rejects a seed another entry already holds', async () => {
      const other = makeParticipant({ id: 'pB', seed: 2 });
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament({ participants: [other] }));
      mockParticipantsRepo.findOne.mockResolvedValue(makeParticipant({ id: 'pA' }));
      await expect(service.assignSeed('tournament-1', 'pA', 2, 'organiser-1')).rejects.toThrow('already taken');
    });
    it("ignores a withdrawn entry's old seed", async () => {
      const other = makeParticipant({ id: 'pB', seed: 2, status: 'WITHDRAWN' });
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament({ participants: [other] }));
      mockParticipantsRepo.findOne.mockResolvedValue(makeParticipant({ id: 'pA' }));
      expect((await service.assignSeed('tournament-1', 'pA', 2, 'organiser-1')).seed).toBe(2);
    });
    it('is locked after the draw', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament({ status: 'IN_PROGRESS' }));
      await expect(service.assignSeed('tournament-1', 'pA', 1, 'organiser-1')).rejects.toThrow('locked');
    });
    it('null clears the seed', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockParticipantsRepo.findOne.mockResolvedValue(makeParticipant({ id: 'pA', seed: 3 }));
      expect((await service.assignSeed('tournament-1', 'pA', null, 'organiser-1')).seed).toBeNull();
    });
  });

  describe('generateDraw refuses unimplemented formats (B-17)', () => {
    it.each([
      [{ drawFormat: 'DOUBLE_ELIMINATION' }, 'not available'],
      [{ tournamentType: 'DOUBLES_MEN' }, 'not available'],
    ])('%o → 400, and the old draw is left alone', async (overrides, msg) => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament(overrides as any));
      mockParticipantsRepo.find.mockResolvedValue([1, 2, 3, 4].map(() => makeParticipant()));
      await expect(service.generateDraw('tournament-1', 'organiser-1')).rejects.toThrow(msg);
      expect(mockMatchesRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('Group Stage + Knockout configurations (B-10)', () => {
    const run = async (players: number, groups: number, advance: number) => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament({
        drawFormat: 'GROUP_STAGE_KNOCKOUT', numberOfGroups: groups, advancePerGroup: advance, seeded: false, minParticipants: 2,
      }));
      mockParticipantsRepo.find.mockResolvedValue(Array.from({ length: players }, (_, i) => makeParticipant({ id: `p${i}` })));
      let g = 0;
      mockGroupsRepo.create.mockImplementation((d) => ({ ...d, id: `group-${++g}` }));
      mockGroupsRepo.save.mockImplementation(async (x) => x);
      mockParticipantsRepo.save.mockImplementation(async (x) => x);
      mockMatchesRepo.save.mockImplementation(async (x) => x);
      return service.generateDraw('tournament-1', 'organiser-1');
    };
    const ko = (matches: TournamentMatchEntity[]) => matches.filter((m) => m.stage === 'KNOCKOUT');

    it('12 players / 3 groups / 2 advance → 8-slot knockout with 2 byes for top qualifiers', async () => {
      const { matches } = await run(12, 3, 2);
      const r1 = ko(matches).filter((m) => m.round === 1);
      expect(r1).toHaveLength(4);
      expect(ko(matches)).toHaveLength(7);
      const labels = r1.flatMap((m) => [m.slot1, m.slot2]);
      expect(labels.filter((l) => l === 'BYE')).toHaveLength(2);
      // the byes face group winners, never a runner-up
      for (const m of r1.filter((m) => m.slot1 === 'BYE' || m.slot2 === 'BYE'))
        expect([m.slot1, m.slot2].find((l) => l !== 'BYE')).toMatch(/^[A-C]1$/);
      expect(Number.isInteger(ko(matches).length)).toBe(true);
    });

    it.each([[18, 6, 1], [9, 3, 1], [24, 4, 3]])('%i players / %i groups / %i advance builds without error', async (n, g, a) => {
      const { matches } = await run(n, g, a);
      const size = ko(matches).filter((m) => m.round === 1).length * 2;
      expect(size & (size - 1)).toBe(0);
      expect(size).toBeGreaterThanOrEqual(g * a);
    });

    it('6 players / 4 groups → 400, before the old draw is deleted', async () => {
      await expect(run(6, 4, 2)).rejects.toThrow('use at most 2 groups');
      expect(mockMatchesRepo.delete).not.toHaveBeenCalled();
    });

    it('groups of 3 cannot send 3 through → 400', async () => {
      await expect(run(9, 3, 3)).rejects.toThrow('at most 2 can advance');
    });

    it('fewer than 6 players → 400', async () => {
      await expect(run(5, 2, 1)).rejects.toThrow('at least 6 players');
    });
  });

  describe('draw is locked after the first result (B-19)', () => {
    const played = [
      { id: 'm1', status: 'COMPLETED', participant1Id: 'pA', participant2Id: 'pB' },
      { id: 'm2', status: 'SCHEDULED', participant1Id: 'pC', participant2Id: 'pD' },
    ] as TournamentMatchEntity[];

    it('swap → 400', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockMatchesRepo.find.mockResolvedValue(played);
      await expect(service.swapParticipants('tournament-1', { participantId1: 'pC', participantId2: 'pD' }, 'organiser-1'))
        .rejects.toThrow('locked');
      expect(mockMatchesRepo.save).not.toHaveBeenCalled();
    });
    it('slot edit → 400', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockMatchesRepo.findOne.mockResolvedValue(played[1]);
      mockMatchesRepo.find.mockResolvedValue(played);
      await expect(service.updateDrawSlot('tournament-1', 'm2', 'participant1Id', null, 'organiser-1')).rejects.toThrow('locked');
    });
    it('BYEs alone do not lock the draw', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockMatchesRepo.find.mockResolvedValue([{ id: 'b', status: 'BYE', participant1Id: 'pA', winnerId: 'pA' }] as any);
      mockMatchesRepo.save.mockImplementation(async (m) => m);
      await expect(service.swapParticipants('tournament-1', { participantId1: 'pA', participantId2: 'pZ' }, 'organiser-1'))
        .resolves.toBeDefined();
    });
  });

  // ── UPDATE MATCH ───────────────────────────────────────────────────────────

  describe('updateMatch', () => {
    const p1 = makeParticipant({ id: 'part1', playerId: 'player1' });
    const p2 = makeParticipant({ id: 'part2', playerId: 'player2' });
    const WIN_P1 = [{ p1: 6, p2: 3 }, { p1: 6, p2: 4 }];
    const WIN_P2 = [{ p1: 3, p2: 6 }, { p1: 4, p2: 6 }];

    let next: any;
    const setupMatch = (matchOverrides: Partial<TournamentMatchEntity> = {}, nextOverrides: any = {}, tOverrides: any = {}) => {
      const tournament = makeTournament({ status: 'IN_PROGRESS', participants: [p1, p2], ...tOverrides });
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
          nextSlot: 1,
          sets: [],
          winnerId: null,
          completedAt: null,
        } as unknown as TournamentMatchEntity,
        matchOverrides,
      );
      next = { id: 'match-next', participant1Id: null, participant2Id: null, status: 'SCHEDULED', winnerId: null, ...nextOverrides };

      mockTournamentsRepo.findOne.mockResolvedValue(tournament);
      mockMatchesRepo.findOne.mockImplementation(async ({ where }) => {
        if (where.id === 'match-1') return match;
        if (where.id === 'match-next') return next;
        return null;
      });
      mockMatchesRepo.save.mockImplementation(async (m) => m);
      return { tournament, match };
    };
    const score = (dto: any) => service.updateMatch('tournament-1', 'match-1', dto, 'organiser-1');
    const savedNext = () => mockMatchesRepo.save.mock.calls.find((c) => c[0].id === 'match-next')?.[0];

    it('sets the status without recording a result', async () => {
      setupMatch();
      const result = await score({ status: 'IN_PROGRESS' });
      expect(result.status).toBe('IN_PROGRESS');
      expect(result.winnerId).toBeNull();
      expect(mockStatsClient.emit).not.toHaveBeenCalled();
    });

    it('records sets, winner, COMPLETED and completedAt', async () => {
      setupMatch();
      const result = await score({ sets: WIN_P1, winnerId: 'part1' });
      expect(result.status).toBe('COMPLETED');
      expect(result.completedAt).toBeTruthy();
      expect(result.winnerId).toBe('part1');
      expect(result.sets).toEqual(WIN_P1);
    });

    // QA-6 (a): winner who is not in the match
    it('rejects a winner who is not one of the two players', async () => {
      setupMatch();
      await expect(score({ sets: WIN_P1, winnerId: 'stranger' })).rejects.toThrow(BadRequestException);
      expect(mockMatchesRepo.save).not.toHaveBeenCalled();
    });

    // QA-6 (b): scoring a match whose players aren't known yet
    it('rejects scoring a TBD match', async () => {
      setupMatch({ participant2Id: null });
      await expect(score({ sets: WIN_P1, winnerId: 'part1' })).rejects.toThrow(BadRequestException);
    });

    // QA-6 (c): the loser picked as winner
    it('rejects a winner who won fewer sets', async () => {
      setupMatch();
      await expect(score({ sets: WIN_P2, winnerId: 'part1' })).rejects.toThrow('more sets');
    });

    it('rejects a level set', async () => {
      setupMatch();
      await expect(score({ sets: [{ p1: 6, p2: 6 }], winnerId: 'part1' })).rejects.toThrow(BadRequestException);
    });

    it('rejects a winner without set scores', async () => {
      setupMatch();
      await expect(score({ winnerId: 'part1' })).rejects.toThrow(BadRequestException);
    });

    it('rejects scoring a BYE', async () => {
      setupMatch({ status: 'BYE', participant2Id: null });
      await expect(score({ sets: WIN_P1, winnerId: 'part1' })).rejects.toThrow(BadRequestException);
    });

    it('rejects results unless the tournament is IN_PROGRESS', async () => {
      setupMatch({}, {}, { status: 'OPEN' });
      await expect(score({ sets: WIN_P1, winnerId: 'part1' })).rejects.toThrow(BadRequestException);
    });

    // QA-6 (d): status is an enum — enforced by UpdateMatchDto
    it('the DTO rejects a free-text status and malformed sets', async () => {
      const { plainToInstance } = await import('class-transformer');
      const { validate } = await import('class-validator');
      const bad = plainToInstance(UpdateMatchDto, { status: 'BANANA', sets: [{ p1: 'abc', p2: -1 }] });
      const errors = await validate(bad);
      expect(errors.map((e) => e.property).sort()).toEqual(['sets', 'status']);
    });

    // QA-7: the winner goes to their bracket side, not the first empty slot
    it('advances the winner of an odd-position match into slot 2 even when slot 1 is empty', async () => {
      setupMatch({ position: 1, nextSlot: 2 });
      await score({ sets: WIN_P1, winnerId: 'part1' });
      expect(savedNext().participant2Id).toBe('part1');
      expect(savedNext().participant1Id).toBeNull();
    });

    it('advances the winner of an even-position match into slot 1', async () => {
      setupMatch({}, { participant2Id: 'part-other' });
      await score({ sets: WIN_P1, winnerId: 'part1' });
      expect(savedNext().participant1Id).toBe('part1');
      expect(savedNext().participant2Id).toBe('part-other');
    });

    it('falls back to the bracket position for draws made before nextSlot existed', async () => {
      setupMatch({ position: 3, nextSlot: null });
      await score({ sets: WIN_P1, winnerId: 'part1' });
      expect(savedNext().participant2Id).toBe('part1');
    });

    it('a corrected winner replaces the earlier winner in the next match', async () => {
      setupMatch({ status: 'COMPLETED', winnerId: 'part1', sets: WIN_P1 }, { participant1Id: 'part1' });
      await score({ sets: WIN_P2, winnerId: 'part2' });
      expect(savedNext().participant1Id).toBe('part2');
    });

    it('refuses to change the winner once the next match has been played (409)', async () => {
      setupMatch({ status: 'COMPLETED', winnerId: 'part1', sets: WIN_P1 },
        { participant1Id: 'part1', participant2Id: 'x', status: 'COMPLETED', winnerId: 'x' });
      await expect(score({ sets: WIN_P2, winnerId: 'part2' })).rejects.toThrow(ConflictException);
      expect(mockMatchesRepo.save).not.toHaveBeenCalled();
    });

    it('allows correcting only the set scores after the next match has been played', async () => {
      setupMatch({ status: 'COMPLETED', winnerId: 'part1', sets: WIN_P1 },
        { participant1Id: 'part1', participant2Id: 'x', status: 'COMPLETED', winnerId: 'x' });
      const result = await score({ sets: [{ p1: 7, p2: 5 }, { p1: 6, p2: 0 }], winnerId: 'part1' });
      expect(result.sets).toEqual([{ p1: 7, p2: 5 }, { p1: 6, p2: 0 }]);
    });

    it('emits nothing when the same result is submitted again', async () => {
      setupMatch({ status: 'COMPLETED', winnerId: 'part1', sets: WIN_P1 }, { participant1Id: 'part1' });
      await score({ sets: WIN_P1, winnerId: 'part1' });
      expect(mockStatsClient.emit).not.toHaveBeenCalled();
      expect(mockNotificationsClient.emit).not.toHaveBeenCalled();
      expect(mockMatchesRepo.save).not.toHaveBeenCalled();
    });

    it('emits match.corrected (with the previous result) instead of a second match.completed', async () => {
      setupMatch({ status: 'COMPLETED', winnerId: 'part1', sets: WIN_P1 }, { participant1Id: 'part1' });
      await score({ sets: WIN_P2, winnerId: 'part2' });
      expect(mockStatsClient.emit).toHaveBeenCalledTimes(1);
      expect(mockStatsClient.emit).toHaveBeenCalledWith('match.corrected', expect.objectContaining({
        winnerPlayerId: 'player2',
        previous: expect.objectContaining({ winnerPlayerId: 'player1', sets: WIN_P1 }),
      }));
      expect(mockNotificationsClient.emit).not.toHaveBeenCalled();
    });

    it('runs both saves inside a single transaction', async () => {
      setupMatch();
      await score({ sets: WIN_P1, winnerId: 'part1' });
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('rolls back and does not advance the winner if the second save fails', async () => {
      setupMatch();
      mockQueryRunner.manager.save = jest.fn()
        .mockResolvedValueOnce({ id: 'match-1' })
        .mockRejectedValueOnce(new Error('db exploded'));
      await expect(score({ sets: WIN_P1, winnerId: 'part1' })).rejects.toThrow('db exploded');
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('emits match.completed with player IDs (not participant IDs) to stats and notifications', async () => {
      setupMatch();
      await score({ sets: WIN_P1, winnerId: 'part1' });
      const expected = expect.objectContaining({
        matchId: 'match-1', tournamentId: 'tournament-1', winnerId: 'part1',
        player1Id: 'player1', player2Id: 'player2', winnerPlayerId: 'player1', loserPlayerId: 'player2',
      });
      expect(mockStatsClient.emit).toHaveBeenCalledWith('match.completed', expected);
      expect(mockNotificationsClient.emit).toHaveBeenCalledWith('match.completed', expected);
    });

    it('throws ForbiddenException for non-organiser', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      await expect(service.updateMatch('tournament-1', 'match-1', {}, 'other')).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when match does not exist', async () => {
      mockTournamentsRepo.findOne.mockResolvedValue(makeTournament());
      mockMatchesRepo.findOne.mockResolvedValue(null);
      await expect(service.updateMatch('tournament-1', 'missing', {}, 'organiser-1')).rejects.toThrow(NotFoundException);
    });
  });
});
