import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UserEntity } from './entities/user.entity';
import { ClubEntity } from './entities/club.entity';
import { ClubMembershipEntity } from './entities/club-membership.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ClubClaim, JwtPayload, MAX_CLUB_CLAIMS } from './interfaces/user.interface';
import { AuditLogger } from './audit-logger.service';
import { normalizeEmail } from './dto/normalize';
import { ACCESS_TOKEN_TTL, REFRESH_TOKEN_DAYS } from '../env';

/** A rotated token presented again this soon is a concurrent refresh, not a stolen copy. */
const REUSE_GRACE_MS = 10_000;

const hashToken = (token: string) => createHash('sha256').update(String(token)).digest('hex');

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(ClubMembershipEntity)
    private readonly membershipsRepo: Repository<ClubMembershipEntity>,
    @InjectRepository(ClubEntity)
    private readonly clubsRepo: Repository<ClubEntity>,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshRepo: Repository<RefreshTokenEntity>,
    private readonly jwtService: JwtService,
    private readonly auditLogger: AuditLogger,
  ) {}

  /** Runs after migrations, before the service takes traffic. */
  async onApplicationBootstrap() {
    await this.bootstrapSuperAdmin(process.env.SUPERADMIN_EMAIL, process.env.SUPERADMIN_INITIAL_PASSWORD);
  }

  /**
   * L-02: the platform owner exists from the first deploy, with no SQL.
   * If SUPERADMIN_EMAIL is set and there is no SUPER_ADMIN yet, promote that
   * account, or create it with SUPERADMIN_INITIAL_PASSWORD (which must be
   * changed at first sign-in). Once any super-admin exists this does nothing,
   * so the variables can stay in .env safely.
   */
  async bootstrapSuperAdmin(rawEmail?: string, initialPassword?: string) {
    if (!rawEmail?.trim()) return;
    if (await this.usersRepo.findOne({ where: { role: 'SUPER_ADMIN' } })) return;

    const email = normalizeEmail(rawEmail) as string;
    const existing = await this.usersRepo.findOne({ where: { email } });
    if (existing) {
      existing.role = 'SUPER_ADMIN';
      await this.usersRepo.save(existing);
      this.auditLogger.record({ actorId: null, action: 'SUPER_ADMIN_BOOTSTRAPPED', targetId: existing.id, how: 'promoted' });
      return;
    }
    if (!initialPassword || initialPassword.length < 12) {
      this.logger.error(
        `SUPERADMIN_EMAIL ${email} has no account yet; set SUPERADMIN_INITIAL_PASSWORD (12+ characters) to create it`,
      );
      return;
    }
    const user = await this.usersRepo.save(this.usersRepo.create({
      email,
      name: email.split('@')[0],
      role: 'SUPER_ADMIN',
      passwordHash: await bcrypt.hash(initialPassword, 10),
      mustChangePassword: true,
    }));
    this.auditLogger.record({ actorId: null, action: 'SUPER_ADMIN_BOOTSTRAPPED', targetId: user.id, how: 'created' });
  }

  async register(dto: RegisterDto) {
    const email = normalizeEmail(dto.email) as string;
    const existing = await this.usersRepo.findOne({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    // Everyone signs up as a player; clubs make people admins (L-02/L-03).
    const user = this.usersRepo.create({
      email,
      name: dto.name,
      role: 'PLAYER',
      passwordHash,
    });
    await this.usersRepo.save(user);

    return this.publicResponse(user);
  }

  async updateRole(userId: string, dto: UpdateRoleDto, actorId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'SUPER_ADMIN' && dto.role !== 'SUPER_ADMIN') {
      const supers = await this.usersRepo.count({ where: { role: 'SUPER_ADMIN' } });
      if (supers <= 1) throw new BadRequestException('The platform must keep at least one super-admin');
    }

    const previousRole = user.role;
    user.role = dto.role;
    await this.usersRepo.save(user);
    this.auditLogger.record({ actorId, action: 'ROLE_CHANGED', targetId: userId, from: previousRole, to: dto.role });

    return this.sanitize(user);
  }

  async login(dto: LoginDto) {
    const email = normalizeEmail(dto.email) as string;
    const user = await this.usersRepo.findOne({ where: { email } });
    if (!user) {
      this.auditLogger.record({ actorId: null, action: 'LOGIN_FAILED', targetId: email, reason: 'unknown_user' });
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      this.auditLogger.record({ actorId: user.id, action: 'LOGIN_FAILED', targetId: email, reason: 'wrong_password' });
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.publicResponse(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('Choose a password different from the current one');
    }
    user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    user.mustChangePassword = false;
    await this.usersRepo.save(user);
    this.auditLogger.record({ actorId: userId, action: 'PASSWORD_CHANGED', targetId: userId });
    return this.publicResponse(user);
  }

  async getMe(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return { ...this.sanitize(user), clubs: await this.clubsOf(user.id) };
  }

  /**
   * Swap a refresh token for a new pair (L-17). The token is single-use:
   * it's revoked and replaced. Presenting an already-used token means someone
   * copied it, so every session of that user is revoked and they sign in again.
   * Club memberships and role are re-read, so changes apply from here.
   */
  async refresh(dto: RefreshTokenDto) {
    const row = await this.refreshRepo.findOne({ where: { tokenHash: hashToken(dto.refreshToken) } });
    if (!row) throw new UnauthorizedException('Invalid or expired refresh token');
    if (row.revokedAt) {
      // Two tabs refreshing at once look like reuse; within a few seconds of
      // the rotation it's that race, not theft: refuse this one quietly.
      const raced = Date.now() - row.revokedAt.getTime() < REUSE_GRACE_MS;
      if (row.replacedBy && !raced) {
        await this.revokeAllFor(row.userId);
        this.auditLogger.record({ actorId: row.userId, action: 'REFRESH_TOKEN_REUSED', targetId: row.id });
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (row.expiresAt.getTime() <= Date.now()) throw new UnauthorizedException('Invalid or expired refresh token');

    const user = await this.usersRepo.findOne({ where: { id: row.userId } });
    if (!user) throw new UnauthorizedException('Invalid refresh token');

    const response = await this.buildResponse(user);
    row.revokedAt = new Date();
    row.replacedBy = response.refreshTokenId;
    await this.refreshRepo.save(row);
    const { refreshTokenId, ...out } = response;
    return out;
  }

  /** Sign-out: this session's refresh token stops working (L-17). Unknown tokens are ignored. */
  async logout(refreshToken: string) {
    const row = await this.refreshRepo.findOne({ where: { tokenHash: hashToken(refreshToken) } });
    if (row && !row.revokedAt) {
      row.revokedAt = new Date();
      await this.refreshRepo.save(row);
    }
  }

  /** Ends every session of a user (token reuse now; disabling an account in L-04). */
  async revokeAllFor(userId: string) {
    await this.refreshRepo.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  /** ACTIVE memberships in ACTIVE clubs, with club names for the UI. */
  async clubsOf(userId: string): Promise<(ClubClaim & { name: string; slug: string })[]> {
    const memberships = await this.membershipsRepo.find({ where: { userId, status: 'ACTIVE' } });
    if (!memberships.length) return [];
    const clubs = await this.clubsRepo.find({ where: { id: In(memberships.map((m) => m.clubId)), status: 'ACTIVE' } });
    const byId = new Map(clubs.map((c) => [c.id, c]));
    return memberships
      .filter((m) => byId.has(m.clubId))
      // Admin seats first, so they survive the claim cap.
      .sort((a, b) => (a.role === b.role ? 0 : a.role === 'ADMIN' ? -1 : 1))
      .slice(0, MAX_CLUB_CLAIMS)
      .map((m) => ({ id: m.clubId, role: m.role, name: byId.get(m.clubId).name, slug: byId.get(m.clubId).slug }));
  }

  /** A token pair for the client (without the internal refresh-token id). */
  private async publicResponse(user: UserEntity) {
    const { refreshTokenId, ...out } = await this.buildResponse(user);
    return out;
  }

  private async buildResponse(user: UserEntity) {
    const clubs = await this.clubsOf(user.id);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      clubs: clubs.map(({ id, role }) => ({ id, role })),
    };
    const token = this.jwtService.sign(payload, { expiresIn: ACCESS_TOKEN_TTL });
    // Refresh tokens are random, not JWTs: only their hash is kept (L-17).
    const refreshToken = randomBytes(32).toString('base64url');
    const row = await this.refreshRepo.save(this.refreshRepo.create({
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * 86400000),
    }));
    return { token, refreshToken, refreshTokenId: row.id, user: { ...this.sanitize(user), clubs } };
  }

  private sanitize(user: UserEntity) {
    const { passwordHash, ...safe } = user;
    return safe;
  }
}
