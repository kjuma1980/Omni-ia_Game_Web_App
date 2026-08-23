import { ArgumentMetadata, BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodType } from 'zod';

/**
 * Pipe de validacion basado en Zod. Se usa por parametro
 * (`@Body(new ZodValidationPipe(schema))`) para mantener los DTO como tipos
 * inferidos y evitar la duplicacion clase-decorador de class-validator.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        message: 'Datos de entrada invalidos',
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    return result.data;
  }
}
