import { Body, Controller, Get, Post } from '@nestjs/common';
import { z } from 'zod';
import { GamificationService } from './gamification.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

const craftSchema = z.object({
  blockKey: z.string().min(1).max(64),
  times: z.number().int().min(1).max(64).default(1),
});

type CraftDto = z.infer<typeof craftSchema>;

@Controller('profile')
export class GamificationController {
  constructor(private readonly gamification: GamificationService) {}

  @Get()
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.gamification.getProfile(user.id);
  }

  @Post('craft')
  craft(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(craftSchema)) dto: CraftDto,
  ) {
    return this.gamification.craft(user.id, dto.blockKey, dto.times);
  }

  @Post('starter-kit')
  starterKit(@CurrentUser() user: AuthenticatedUser) {
    return this.gamification.grantStarterKit(user.id);
  }
}
