import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'creador2d:isPublic';

/** Marca un endpoint como accesible sin token de acceso. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
