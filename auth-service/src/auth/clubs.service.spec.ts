import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { of } from 'rxjs';
import { ClubsService, slugify } from './clubs.service';
import { ClubEntity } from './entities/club.entity';
import { ClubMembershipEntity } from './entities/club-membership.entity';
import { UserEntity } from './entities/user.entity';
import { AuditLogger } from './audit-logger.service';

describe('ClubsService (L-03)', () => {
  let service: ClubsService;
  let clubs: any[];
  let memberships: any[];
  const users = [
    { id: 'u-ann', name: 'Ann', email: 'ann@example.com' },
    { id: 'u-bob', name: 'Bob', email: 'bob@example.com' },
  ];
  const match = (row: any, where: any) =>
    Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && '_type' in (v as any)
      ? ((v as any)._value as any[]).includes(row[k]) // In(...)
      : row[k] === v));
  const clubsRepo = {
    find: jest.fn(async (o?: any) => clubs.filter((c) => !o?.where || match(c, o.where))),
    findOne: jest.fn(async ({ where }) => {
      if (where.name?._type === 'ilike') return clubs.find((c) => c.name.toLowerCase() === where.name._value.toLowerCase()) ?? null;
      return clubs.find((c) => match(c, where)) ?? null;
    }),
    create: jest.fn((d) => ({ id: `c-${clubs.length + 1}`, ...d })),
    save: jest.fn(async (c) => { clubs = clubs.filter((x) => x.id !== c.id).concat(c); return c; }),
  };
  const membershipsRepo = {
    find: jest.fn(async ({ where }) => memberships.filter((m) => match(m, where))),
    findOne: jest.fn(async ({ where }) => memberships.find((m) => match(m, where)) ?? null),
    count: jest.fn(async ({ where }) => memberships.filter((m) => match(m, where)).length),
    create: jest.fn((d) => ({ id: `m-${memberships.length + 1}`, role: 'MEMBER', status: 'PENDING', ...d })),
    save: jest.fn(async (m) => { memberships = memberships.filter((x) => x.id !== m.id).concat(m); return m; }),
  };
  const usersRepo = {
    findOne: jest.fn(async ({ where }) => users.find((u) => u.id === where.id) ?? null),
    find: jest.fn(async ({ where }) => users.filter((u) => match(u, where))),
  };
  const client = { emit: jest.fn(() => of(undefined)) };

  beforeEach(async () => {
    clubs = [];
    memberships = [];
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ClubsService,
        { provide: getRepositoryToken(ClubEntity), useValue: clubsRepo },
        { provide: getRepositoryToken(ClubMembershipEntity), useValue: membershipsRepo },
        { provide: getRepositoryToken(UserEntity), useValue: usersRepo },
        { provide: 'TOURNAMENTS_CLIENT', useValue: client },
        { provide: AuditLogger, useValue: { record: jest.fn() } },
      ],
    }).compile();
    service = module.get(ClubsService);
  });

  it('slugify makes URL-safe slugs', () => {
    expect(slugify('Winter Club  Open!')).toBe('winter-club-open');
    expect(slugify('Ténis Clube São Paulo')).toBe('tenis-clube-sao-paulo');
    expect(slugify('!!!')).toBe('club');
  });

  it('creates an ACTIVE club with a unique slug and announces it to tournament-service', async () => {
    const a = await service.create({ name: 'FPTC' }, 'boss');
    expect(a).toMatchObject({ name: 'FPTC', slug: 'fptc', status: 'ACTIVE', createdBy: 'boss' });
    expect(client.emit).toHaveBeenCalledWith('club.upserted', { id: a.id, name: 'FPTC', slug: 'fptc', status: 'ACTIVE' });
  });

  it('refuses a duplicate name, whatever the case', async () => {
    await service.create({ name: 'FPTC' }, 'boss');
    await expect(service.create({ name: 'fptc' }, 'boss')).rejects.toThrow(ConflictException);
  });

  it('appoints an admin (creating the membership) and lists them', async () => {
    const club = await service.create({ name: 'FPTC' }, 'boss');
    const admins = await service.appointAdmin(club.id, { userId: 'u-ann' }, 'boss');
    expect(admins).toEqual([{ userId: 'u-ann', name: 'Ann', email: 'ann@example.com' }]);
    expect(memberships[0]).toMatchObject({ clubId: club.id, userId: 'u-ann', role: 'ADMIN', status: 'ACTIVE' });
    await expect(service.appointAdmin(club.id, { userId: 'u-ann' }, 'boss')).rejects.toThrow(ConflictException);
  });

  it('keeps at least one admin unless the super-admin forces it', async () => {
    const club = await service.create({ name: 'FPTC' }, 'boss');
    await service.appointAdmin(club.id, { userId: 'u-ann' }, 'boss');
    await expect(service.removeAdmin(club.id, 'u-ann', false, 'boss')).rejects.toThrow(BadRequestException);

    await service.appointAdmin(club.id, { userId: 'u-bob' }, 'boss');
    expect(await service.removeAdmin(club.id, 'u-ann', false, 'boss')).toEqual([{ userId: 'u-bob', name: 'Bob', email: 'bob@example.com' }]);
    // Ann stays in the club as a member
    expect(memberships.find((m) => m.userId === 'u-ann')).toMatchObject({ role: 'MEMBER', status: 'ACTIVE' });

    expect(await service.removeAdmin(club.id, 'u-bob', true, 'boss')).toEqual([]);
  });

  it('deactivating a club is announced, so its tournaments can be hidden', async () => {
    const club = await service.create({ name: 'FPTC' }, 'boss');
    client.emit.mockClear();
    await service.update(club.id, { status: 'INACTIVE' }, 'boss');
    expect(client.emit).toHaveBeenCalledWith('club.upserted', expect.objectContaining({ id: club.id, status: 'INACTIVE' }));
    expect(await service.directory()).toEqual([]);
  });

  it('user search needs at least 2 characters', async () => {
    expect(await service.searchUsers(' a ')).toEqual([]);
  });
});
