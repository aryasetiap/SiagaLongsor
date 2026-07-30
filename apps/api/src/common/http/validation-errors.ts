import { BadRequestException, type ValidationError } from '@nestjs/common';

interface ValidationDetail {
  readonly field: string;
  readonly messages: string[];
}

export function createValidationException(errors: ValidationError[]): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: 'Payload tidak valid.',
    details: flattenValidationErrors(errors),
  });
}

function flattenValidationErrors(errors: ValidationError[], parent = ''): ValidationDetail[] {
  return errors.flatMap((error) => {
    const field = parent.length > 0 ? `${parent}.${error.property}` : error.property;
    const ownErrors =
      error.constraints === undefined
        ? []
        : [{ field, messages: Object.values(error.constraints) }];
    const childErrors = flattenValidationErrors(error.children ?? [], field);

    return [...ownErrors, ...childErrors];
  });
}
