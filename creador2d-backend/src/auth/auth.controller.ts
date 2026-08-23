import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthenticatedUser } from './auth.types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  CloudSessionDto,
  LoginDto,
  RegisterDto,
  RefreshDto,
  cloudSessionSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
} from './dto/auth.schemas';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.register(dto, userAgent);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.login(dto, userAgent);
  }

  /**
   * Sesion a partir de la cuenta de Omni IA Game, sin segundo login.
   *
   * `@Public()` porque no llega con token propio -es justamente lo que viene a
   * conseguir-, pero NO es abierta: exige el secreto de enlace que solo conoce
   * la aplicacion instalada en esta maquina. El limite es bajo por la misma
   * razon que en `login`: un acierto por fuerza bruta abriria sesion.
   */
  @Public()
  @Post('cloud-session')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  cloudSession(
    @Body(new ZodValidationPipe(cloudSessionSchema)) dto: CloudSessionDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.cloudSession(dto.email, dto.secret, userAgent);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  refresh(
    @Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.refresh(dto.refreshToken, userAgent);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@CurrentUser() user: AuthenticatedUser, @Body() body: { refreshToken?: string }) {
    return this.authService.logout(user.id, body?.refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  /**
   * Token de servicio para los plugins de Unity / Godot / Unreal. Se genera
   * desde el editor y se pega en la configuracion del plugin, de forma que el
   * motor jamas maneja la clave del usuario.
   */
  @Post('engine-token/:worldId')
  @HttpCode(HttpStatus.OK)
  engineToken(@CurrentUser() user: AuthenticatedUser, @Param('worldId') worldId: string) {
    return this.authService.issueEngineToken(user, worldId);
  }
}
