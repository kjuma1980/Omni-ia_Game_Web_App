import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { Role , asRole } from '../enums';
import { hash, verify } from '@node-rs/argon2';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppConfig } from '../common/config/configuration';
import { AccessTokenPayload, AuthenticatedUser, RefreshTokenPayload, TokenPair } from './auth.types';
import { LoginDto, RegisterDto } from './dto/auth.schemas';

/**
 * Parametros Argon2id. Coinciden con la recomendacion OWASP de 2024 para
 * hardware de escritorio (19 MiB de memoria, 2 iteraciones, paralelismo 1).
 */
const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Hash imposible de satisfacer, para las cuentas creadas desde la cuenta de la
 * nube. Es un Argon2id con formato valido pero que ninguna contrasena produce,
 * de modo que `login` falla siempre contra el sin necesidad de anadir una
 * columna nueva ni tocar la ruta de login, que funciona.
 */
const SIN_CONTRASENA =
  '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$0000000000000000000000000000000000000000000';

/**
 * Comparacion de cadenas en tiempo constante.
 *
 * Un `===` corriente sale en cuanto encuentra el primer caracter distinto, y
 * ese tiempo, medido muchas veces, deja adivinar el secreto caracter a
 * caracter. Se igualan longitudes con un hash previo para que la propia
 * longitud tampoco filtre nada.
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<{ app: AppConfig }, true>,
  ) {}

  private get config(): AppConfig {
    return this.configService.get('app', { infer: true });
  }

  async register(dto: RegisterDto, userAgent?: string): Promise<TokenPair & { user: AuthenticatedUser }> {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email.toLowerCase() }, { username: dto.username }] },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('El email o el usuario ya estan registrados');
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        username: dto.username,
        passwordHash: await hash(dto.password, ARGON2_OPTIONS),
        role: Role.CREATOR,
        profile: { create: {} },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: 'USER',
        actorId: user.id,
        action: 'AUTH_REGISTER',
        entity: 'User',
        entityId: user.id,
      },
    });

    return this.issueTokens(user, randomUUID(), userAgent);
  }

  async login(dto: LoginDto, userAgent?: string): Promise<TokenPair & { user: AuthenticatedUser }> {
    const identifier = dto.identifier.toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { username: dto.identifier }] },
    });

    // Se ejecuta una verificacion incluso sin usuario para que el tiempo de
    // respuesta no revele si el email existe (defensa contra enumeracion).
    const passwordHash =
      user?.passwordHash ??
      '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$0000000000000000000000000000000000000000000';

    let valid = false;
    try {
      valid = await verify(passwordHash, dto.password);
    } catch {
      valid = false;
    }

    if (!user || !valid || !user.isActive) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    return this.issueTokens(user, randomUUID(), userAgent);
  }

  /**
   * Sesion derivada de la cuenta de Omni IA Game: UN SOLO INICIO DE SESION.
   *
   * La aplicacion anfitriona no deja ver nada hasta haber validado la cuenta
   * contra su servidor en la nube, asi que para cuando se llega al Creador 2D
   * la identidad ya esta comprobada. Pedir aqui un segundo usuario y contrasena
   * no anadia seguridad: anadia una credencial mas que memorizar.
   *
   * NO SE TOCA NADA AGUAS ABAJO. Se busca o se crea un `User` local con ese
   * correo y se devuelve el MISMO par de tokens que `login`, de modo que el
   * `userId` del que cuelgan los mundos, los roles, el perfil de progresion y
   * el guard que protege puntos y experiencia siguen funcionando igual.
   *
   * Lo que autoriza la peticion es `secret`, que genera el arrancador en el
   * primer inicio y solo puede leer la aplicacion instalada en esta maquina.
   * Sin el, una pagina web cualquiera podria pedirle al servicio local una
   * sesion a nombre del correo que quisiera.
   */
  async cloudSession(
    email: string,
    secret: string,
    userAgent?: string,
  ): Promise<TokenPair & { user: AuthenticatedUser }> {
    const esperado = this.config.linkSecret;

    // Vacio significa desactivado: sin secreto configurado no hay enlace, y se
    // responde igual que si el secreto fuera incorrecto para no revelar cual de
    // las dos cosas ocurre.
    if (!esperado || !timingSafeEqualStr(secret, esperado)) {
      throw new UnauthorizedException('Enlace con Omni IA Game no autorizado');
    }

    const correo = email.toLowerCase();
    const existente = await this.prisma.user.findUnique({ where: { email: correo } });

    if (existente) {
      if (!existente.isActive) {
        throw new UnauthorizedException('Usuario inactivo');
      }
      return this.issueTokens(existente, randomUUID(), userAgent);
    }

    const creado = await this.prisma.user.create({
      data: {
        email: correo,
        username: await this.usernameLibre(correo),
        // Hash imposible de satisfacer: esta cuenta NO se abre por el
        // formulario. `verify` fallara siempre contra el, con lo que la unica
        // puerta de entrada es este enlace.
        passwordHash: SIN_CONTRASENA,
        role: Role.CREATOR,
        profile: { create: {} },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: 'USER',
        actorId: creado.id,
        action: 'AUTH_CLOUD_SESSION_CREATE',
        entity: 'User',
        entityId: creado.id,
      },
    });

    this.logger.log(`Cuenta local creada desde la cuenta de Omni IA Game: ${correo}`);
    return this.issueTokens(creado, randomUUID(), userAgent);
  }

  /**
   * Nombre de usuario a partir del correo, sin chocar con los existentes.
   *
   * `username` es unico en la base, y dos correos distintos pueden dar la misma
   * parte local (`ana@a.com` y `ana@b.com`), asi que hay que desempatar.
   */
  private async usernameLibre(correo: string): Promise<string> {
    const base = (correo.split('@')[0] || 'usuario')
      .replace(/[^a-zA-Z0-9_.-]/g, '')
      .slice(0, 24) || 'usuario';

    if (!(await this.prisma.user.findUnique({ where: { username: base } }))) {
      return base;
    }
    for (let i = 2; i < 100; i += 1) {
      const intento = `${base}${i}`.slice(0, 32);
      if (!(await this.prisma.user.findUnique({ where: { username: intento } }))) {
        return intento;
      }
    }
    return `${base.slice(0, 24)}${randomUUID().slice(0, 7)}`;
  }

  /**
   * Rotacion de refresh token con deteccion de reutilizacion.
   *
   * Cada refresh emitido pertenece a una "familia". Al canjear uno se revoca y
   * se emite el siguiente de la misma familia. Si llega un token ya revocado
   * significa que alguien esta reutilizando material robado: se revoca la
   * familia completa y se obliga a un login nuevo.
   */
  async refresh(token: string, userAgent?: string): Promise<TokenPair & { user: AuthenticatedUser }> {
    let payload: RefreshTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.config.jwt.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Refresh token invalido o expirado');
    }

    const stored = await this.prisma.refreshToken.findUnique({ where: { id: payload.jti } });

    if (!stored || stored.userId !== payload.sub) {
      throw new UnauthorizedException('Refresh token desconocido');
    }

    if (stored.revokedAt) {
      await this.revokeFamily(stored.familyId);
      this.logger.warn(
        `Reutilizacion de refresh token detectada (familia ${stored.familyId}). Familia revocada.`,
      );
      throw new UnauthorizedException('Refresh token reutilizado: sesion revocada');
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expirado');
    }

    const matches = await verify(stored.tokenHash, token).catch(() => false);
    if (!matches) {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Refresh token manipulado: sesion revocada');
    }

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    const rotated = await this.issueTokens(user, stored.familyId, userAgent);

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedById: rotated.refreshTokenId },
    });

    return rotated;
  }

  async logout(userId: string, token?: string): Promise<{ revoked: number }> {
    if (token) {
      try {
        const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(token, {
          secret: this.config.jwt.refreshSecret,
        });
        const stored = await this.prisma.refreshToken.findUnique({ where: { id: payload.jti } });
        if (stored && stored.userId === userId) {
          return { revoked: await this.revokeFamily(stored.familyId) };
        }
      } catch {
        // Token ilegible: se cae al cierre global de sesiones del usuario.
      }
    }

    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { revoked: result.count };
  }

  private async revokeFamily(familyId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  private async issueTokens(
    user: User,
    familyId: string,
    userAgent?: string,
  ): Promise<TokenPair & { user: AuthenticatedUser; refreshTokenId: string }> {
    const config = this.config;

    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      role: asRole(user.role),
    };

    // `expiresIn` se expresa en segundos: la firma tipada de @nestjs/jwt no
    // acepta una cadena generica, y convertir aqui evita castings opacos.
    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: config.jwt.accessSecret,
      expiresIn: Math.floor(parseDuration(config.jwt.accessTtl) / 1000),
    });

    const refreshId = randomUUID();
    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      familyId,
      jti: refreshId,
    };

    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: config.jwt.refreshSecret,
      expiresIn: Math.floor(parseDuration(config.jwt.refreshTtl) / 1000),
    });

    await this.prisma.refreshToken.create({
      data: {
        id: refreshId,
        userId: user.id,
        familyId,
        // Solo se guarda el hash: una filtracion de la tabla no permite
        // reconstruir tokens utilizables.
        tokenHash: await hash(refreshToken, ARGON2_OPTIONS),
        userAgent: userAgent?.slice(0, 250),
        expiresAt: new Date(Date.now() + parseDuration(config.jwt.refreshTtl)),
      },
    });

    return {
      accessToken,
      refreshToken,
      refreshTokenId: refreshId,
      expiresIn: config.jwt.accessTtl,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: asRole(user.role),
      },
    };
  }

  /**
   * Emite un token de servicio de corta vida para los plugins de motor.
   * El plugin solo necesita lectura, por lo que se firma con el rol VIEWER.
   */
  async issueEngineToken(user: AuthenticatedUser, worldId: string): Promise<{ token: string; fingerprint: string }> {
    const token = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, username: user.username, role: Role.VIEWER, worldId },
      { secret: this.config.jwt.accessSecret, expiresIn: 12 * 60 * 60 },
    );

    return {
      token,
      fingerprint: createHash('sha256').update(token).digest('hex').slice(0, 16),
    };
  }
}

/** Convierte `900s`, `15m`, `7d`, `12h` a milisegundos. */
export function parseDuration(value: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(value.trim());
  if (!match) {
    throw new Error(`Duracion invalida: ${value}`);
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const factors: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return amount * factors[unit];
}
