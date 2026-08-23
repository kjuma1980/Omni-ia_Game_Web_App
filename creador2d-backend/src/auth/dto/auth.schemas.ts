import { z } from 'zod';

export const registerSchema = z.object({
  email: z.email('Email invalido').max(180),
  username: z
    .string()
    .min(3, 'El usuario debe tener al menos 3 caracteres')
    .max(32)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Solo letras, numeros, punto, guion y guion bajo'),
  password: z
    .string()
    .min(10, 'La clave debe tener al menos 10 caracteres')
    .max(128)
    .regex(/[a-z]/, 'Debe incluir una minuscula')
    .regex(/[A-Z]/, 'Debe incluir una mayuscula')
    .regex(/[0-9]/, 'Debe incluir un digito'),
});

export const loginSchema = z.object({
  identifier: z.string().min(3, 'Indique email o usuario').max(180),
  password: z.string().min(1, 'La clave es obligatoria').max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20, 'Refresh token invalido'),
});

/**
 * Sesion derivada de la cuenta de Omni IA Game.
 *
 * No lleva contrasena a proposito: la identidad ya la valido la aplicacion
 * anfitriona contra su servidor en la nube antes de dejar entrar a nadie. Lo
 * que autoriza esta peticion es `secret`, que solo conoce la aplicacion
 * instalada en esta misma maquina.
 */
export const cloudSessionSchema = z.object({
  email: z.email('Email invalido').max(180),
  secret: z.string().min(32, 'Secreto de enlace invalido').max(256),
});

export type CloudSessionDto = z.infer<typeof cloudSessionSchema>;
export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type RefreshDto = z.infer<typeof refreshSchema>;
