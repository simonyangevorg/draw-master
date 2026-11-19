import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UserEntity } from './entities/user.entity';
import { ClubEntity } from './entities/club.entity';
import { ClubMembershipEntity } from './entities/club-membership.entity';
import { AuditLogger } from './audit-logger.service';

function makeUser(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: 'user-1',
    email: 'existing@example.com',
    name: 'Existing User',
    passwordHash: 'hashed-password',
    role: 'PLAYER',
    mustChangePassword: false,
    createdAt: new Date(),
    ...overrides,
  } as UserEntity;
}

describe('AuthService', () => {
  let service: AuthService;

  const mockUsersRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
  };
  const mockMembershipsRepo = { find: jest.fn() };
  const mockClubsRepo = { find: jest.fn() };
  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };
  const mockAuditLogger = { record: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockMembershipsRepo.find.mockResolvedValue([]);
    mockClubsRepo.find.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(UserEntity), useValue: mockUsersRepo },
        { provide: getRepositoryToken(ClubMembershipEntity), useValue: mockMembershipsRepo },
        { provide: getRepositoryToken(ClubEntity), useValue: mockClubsRepo },
        { provide: JwtService, useValue: mockJwtService },
        { provide: AuditLogger, useValue: mockAuditLogger },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('throws ConflictException when email is already registered', async () => {
      mockUsersRepo.findOne.mockResolvedValue(makeUser());

      await expect(
        service.register({ email: 'existing@example.com', name: 'New', password: 'password123' }),
      ).rejects.toThrow(ConflictException);
    });

    it('everyone signs up as a PLAYER', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);
      mockUsersRepo.create.mockImplementation((data) => data);
      mockUsersRepo.save.mockImplementation(async (u) => u);
      mockJwtService.sign.mockReturnValue('signed-token');

      const result = await service.register({ email: 'new@example.com', name: 'New User', password: 'password123' });

      expect(mockUsersRepo.create).toHaveBeenCalledWith(expect.objectContaining({ role: 'PLAYER' }));
      expect(result.user.email).toBe('new@example.com');
    });

    it('never returns the password hash', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);
      mockUsersRepo.create.mockImplementation((data) => data);
      mockUsersRepo.save.mockImplementation(async (u) => u);
      mockJwtService.sign.mockReturnValue('signed-token');

      const result = await service.register({ email: 'new@example.com', name: 'New User', password: 'password123' });

      expect(result.user).not.toHaveProperty('passwordHash');
    });

    // B-12
    it('looks up and stores the email lower-cased, so a different casing is a 409', async () => {
      mockUsersRepo.findOne.mockImplementation(async ({ where }) =>
        where.email === 'luca.bianchi@example.com' ? makeUser() : null);

      await expect(
        service.register({ email: '  Luca.Bianchi@Example.com ', name: 'Luca', password: 'password123' }),
      ).rejects.toThrow(ConflictException);
    });

    it('saves a new account with the normalised email', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);
      mockUsersRepo.create.mockImplementation((data) => data);
      mockUsersRepo.save.mockImplementation(async (u) => u);
      mockJwtService.sign.mockReturnValue('signed-token');

      await service.register({ email: 'New.User@Example.COM', name: 'New User', password: 'password123' });

      expect(mockUsersRepo.create).toHaveBeenCalledWith(expect.objectContaining({ email: 'new.user@example.com' }));
    });
  });

  describe('login', () => {
    // B-12
    it('logs in whatever casing the email is typed in', async () => {
      const hash = await bcrypt.hash('correct-password', 10);
      mockUsersRepo.findOne.mockImplementation(async ({ where }) =>
        where.email === 'existing@example.com' ? makeUser({ passwordHash: hash }) : null);
      mockJwtService.sign.mockReturnValue('signed-token');

      const result = await service.login({ email: 'EXISTING@Example.com', password: 'correct-password' });

      expect(result.token).toBe('signed-token');
    });

    it('throws UnauthorizedException for an unknown user', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'whatever' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockAuditLogger.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LOGIN_FAILED', reason: 'unknown_user' }),
      );
    });

    it('throws UnauthorizedException for a wrong password', async () => {
      const hash = await bcrypt.hash('correct-password', 10);
      mockUsersRepo.findOne.mockResolvedValue(makeUser({ passwordHash: hash }));

      await expect(
        service.login({ email: 'existing@example.com', password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockAuditLogger.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LOGIN_FAILED', reason: 'wrong_password' }),
      );
    });

    it('returns a token and sanitized user on correct credentials', async () => {
      const hash = await bcrypt.hash('correct-password', 10);
      mockUsersRepo.findOne.mockResolvedValue(makeUser({ passwordHash: hash }));
      mockJwtService.sign.mockReturnValue('signed-token');

      const result = await service.login({ email: 'existing@example.com', password: 'correct-password' });

      expect(result.token).toBe('signed-token');
      expect(result.user).not.toHaveProperty('passwordHash');
    });
  });

  describe('refresh', () => {
    it('throws UnauthorizedException when the token is not a refresh token', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', type: undefined });

      await expect(service.refresh({ refreshToken: 'access-token' })).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when verification fails', async () => {
      mockJwtService.verify.mockImplementation(() => { throw new Error('expired'); });

      await expect(service.refresh({ refreshToken: 'bad-token' })).rejects.toThrow(UnauthorizedException);
    });

    it('issues a new token pair for a valid refresh token', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', type: 'refresh' });
      mockUsersRepo.findOne.mockResolvedValue(makeUser());
      mockJwtService.sign.mockReturnValue('new-token');

      const result = await service.refresh({ refreshToken: 'valid-refresh-token' });

      expect(result.token).toBe('new-token');
    });
  });

  describe('getMe', () => {
    it('throws NotFoundException when the user no longer exists', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await expect(service.getMe('missing-user')).rejects.toThrow(NotFoundException);
    });
  });
});

describe('AuthService: L-02 super-admin, club claims, password change', () => {
  let service: AuthService;
  const users: Record<string, any> = {};
  const usersRepo = {
    findOne: jest.fn(async ({ where }) => Object.values(users).find((u: any) =>
      Object.entries(where).every(([k, v]) => u[k] === v)) ?? null),
    count: jest.fn(async ({ where }) => Object.values(users).filter((u: any) => u.role === where.role).length),
    create: jest.fn((d) => ({ id: `u-${Object.keys(users).length + 1}`, ...d })),
    save: jest.fn(async (u) => (users[u.id] = u)),
  };
  const membershipsRepo = { find: jest.fn() };
  const clubsRepo = { find: jest.fn() };
  const jwt = { sign: jest.fn((p) => JSON.stringify(p)), verify: jest.fn() };
  const audit = { record: jest.fn() };

  beforeEach(async () => {
    for (const k of Object.keys(users)) delete users[k];
    jest.clearAllMocks();
    membershipsRepo.find.mockResolvedValue([]);
    clubsRepo.find.mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(UserEntity), useValue: usersRepo },
        { provide: getRepositoryToken(ClubMembershipEntity), useValue: membershipsRepo },
        { provide: getRepositoryToken(ClubEntity), useValue: clubsRepo },
        { provide: JwtService, useValue: jwt },
        { provide: AuditLogger, useValue: audit },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it('bootstrap creates the super-admin, who must change the password', async () => {
    await service.bootstrapSuperAdmin('Boss@Example.com', 'a-long-initial-pass');
    const boss: any = Object.values(users)[0];
    expect(boss).toMatchObject({ email: 'boss@example.com', role: 'SUPER_ADMIN', mustChangePassword: true });
    expect(await bcrypt.compare('a-long-initial-pass', boss.passwordHash)).toBe(true);
  });

  it('bootstrap is idempotent: a second boot changes nothing', async () => {
    await service.bootstrapSuperAdmin('boss@example.com', 'a-long-initial-pass');
    usersRepo.save.mockClear();
    await service.bootstrapSuperAdmin('boss@example.com', 'a-long-initial-pass');
    await service.bootstrapSuperAdmin('someone-else@example.com', 'another-long-pass');
    expect(usersRepo.save).not.toHaveBeenCalled();
    expect(Object.values(users)).toHaveLength(1);
  });

  it('bootstrap promotes an existing account instead of creating one', async () => {
    users['u-1'] = { id: 'u-1', email: 'boss@example.com', role: 'PLAYER', passwordHash: 'x' };
    await service.bootstrapSuperAdmin('boss@example.com', undefined);
    expect(users['u-1'].role).toBe('SUPER_ADMIN');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'SUPER_ADMIN_BOOTSTRAPPED', how: 'promoted' }));
  });

  it('bootstrap does nothing without SUPERADMIN_EMAIL, or without a strong initial password for a new account', async () => {
    await service.bootstrapSuperAdmin(undefined, 'a-long-initial-pass');
    await service.bootstrapSuperAdmin('boss@example.com', 'short');
    expect(Object.values(users)).toHaveLength(0);
  });

  it('the token carries ACTIVE club seats in active clubs, admin seats first', async () => {
    users['u-1'] = { id: 'u-1', email: 'p@example.com', name: 'P', role: 'PLAYER', passwordHash: await bcrypt.hash('pw-123456', 4) };
    membershipsRepo.find.mockResolvedValue([
      { clubId: 'c-member', userId: 'u-1', role: 'MEMBER', status: 'ACTIVE' },
      { clubId: 'c-admin', userId: 'u-1', role: 'ADMIN', status: 'ACTIVE' },
      { clubId: 'c-closed', userId: 'u-1', role: 'ADMIN', status: 'ACTIVE' },
    ]);
    // c-closed is INACTIVE, so the clubs query leaves it out
    clubsRepo.find.mockResolvedValue([
      { id: 'c-member', name: 'Member Club', slug: 'member-club' },
      { id: 'c-admin', name: 'Admin Club', slug: 'admin-club' },
    ]);
    const res = await service.login({ email: 'p@example.com', password: 'pw-123456' });
    expect(JSON.parse(res.token).clubs).toEqual([{ id: 'c-admin', role: 'ADMIN' }, { id: 'c-member', role: 'MEMBER' }]);
    expect(res.user.clubs.map((c) => c.name)).toEqual(['Admin Club', 'Member Club']);
  });

  it('changing the password needs the current one and clears mustChangePassword', async () => {
    users['u-1'] = {
      id: 'u-1', email: 'b@example.com', name: 'B', role: 'SUPER_ADMIN', mustChangePassword: true,
      passwordHash: await bcrypt.hash('initial-pass-1', 4),
    };
    await expect(service.changePassword('u-1', { currentPassword: 'wrong', newPassword: 'new-pass-123' }))
      .rejects.toThrow(UnauthorizedException);
    await service.changePassword('u-1', { currentPassword: 'initial-pass-1', newPassword: 'new-pass-123' });
    expect(users['u-1'].mustChangePassword).toBe(false);
    expect(await bcrypt.compare('new-pass-123', users['u-1'].passwordHash)).toBe(true);
  });

  it('the last super-admin cannot be demoted', async () => {
    users['u-1'] = { id: 'u-1', role: 'SUPER_ADMIN' };
    await expect(service.updateRole('u-1', { role: 'PLAYER' }, 'u-1')).rejects.toThrow('at least one super-admin');
  });
});
