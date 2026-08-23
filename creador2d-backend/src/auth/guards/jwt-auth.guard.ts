import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';
import { AppConfig } from '../../common/config/configuration';
import { AccessTokenPayload } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<{ app: AppConfig }, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      // Los WebSocket se autentican en el handshake del gateway.
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const header = request.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Falta el token de acceso');
    }

    const config = this.configService.get('app', { infer: true });

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(header.slice(7), {
        secret: config.jwt.accessSecret,
      });

      request.user = {
        id: payload.sub,
        email: payload.email,
        username: payload.username,
        role: payload.role,
      };

      return true;
    } catch {
      throw new UnauthorizedException('Token de acceso invalido o expirado');
    }
  }
}
