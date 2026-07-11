import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UserEntity } from './entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtPayload } from './interfaces/user.interface';
import { AuditLogger } from './audit-logger.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    private readonly jwtService: JwtService,
    private readonly auditLogger: AuditLogger,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.usersRepo.create({
      email: dto.email,
      name: dto.name,
      role: dto.role ?? 'MEMBER',
      clubId: dto.clubId ?? null,
      passwordHash,
    });
    await this.usersRepo.save(user);

    return this.buildResponse(user);
  }

  async updateRole(userId: string, dto: UpdateRoleDto, actorId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const previousRole = user.role;
    user.role = dto.role;
    await this.usersRepo.save(user);
    this.auditLogger.record({ actorId, action: 'ROLE_CHANGED', targetId: userId, from: previousRole, to: dto.role });

    return this.sanitize(user);
  }

  async login(dto: LoginDto) {
    const user = await this.usersRepo.findOne({ where: { email: dto.email } });
    if (!user) {
      this.auditLogger.record({ actorId: null, action: 'LOGIN_FAILED', targetId: dto.email, reason: 'unknown_user' });
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      this.auditLogger.record({ actorId: user.id, action: 'LOGIN_FAILED', targetId: dto.email, reason: 'wrong_password' });
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildResponse(user);
  }

  async getMe(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.sanitize(user);
  }

  async refresh(dto: RefreshTokenDto) {
    let payload: { sub: string; type?: string };
    try {
      payload = this.jwtService.verify(dto.refreshToken, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.type !== 'refresh') throw new UnauthorizedException('Invalid refresh token');

    const user = await this.usersRepo.findOne({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('Invalid refresh token');

    return this.buildResponse(user);
  }

  private buildResponse(user: UserEntity) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
    const token = this.jwtService.sign(payload, { expiresIn: '1h' });
    const refreshToken = this.jwtService.sign({ sub: user.id, type: 'refresh' }, { expiresIn: '30d' });
    return { token, refreshToken, user: this.sanitize(user) };
  }

  private sanitize(user: UserEntity) {
    const { passwordHash, ...safe } = user;
    return safe;
  }
}
