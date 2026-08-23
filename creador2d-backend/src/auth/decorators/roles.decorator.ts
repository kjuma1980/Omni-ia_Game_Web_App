import { SetMetadata } from '@nestjs/common';
import { Role } from '../../enums';

export const ROLES_KEY = 'creador2d:roles';

/** Restringe un endpoint a los roles indicados. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
