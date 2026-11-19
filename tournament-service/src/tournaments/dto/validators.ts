import { Transform } from 'class-transformer';
import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

/** Trims surrounding whitespace so "   " fails @IsNotEmpty (B-14). */
export const Trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Today's date as YYYY-MM-DD (UTC), comparable with the date-only columns. */
export const today = () => new Date().toISOString().slice(0, 10);

const day = (v: unknown) => (typeof v === 'string' ? v.slice(0, 10) : undefined);

/** A date that is today or later. */
export function IsNotPastDate(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isNotPastDate', target: object.constructor, propertyName, options,
      validator: {
        validate: (v: unknown) => day(v) === undefined || day(v) >= today(),
        defaultMessage: (a: ValidationArguments) => `${a.property} cannot be in the past`,
      },
    });
}

/**
 * Compares this field with another field of the same object. Skipped when
 * either side is missing (a partial update), so the service re-checks those
 * against the stored values.
 */
function compareWith(name: string, other: string, ok: (mine: any, theirs: any) => boolean, message: string, fallback?: unknown, options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name, target: object.constructor, propertyName, constraints: [other], options,
      validator: {
        validate(v: unknown, a: ValidationArguments) {
          const theirs = (a.object as any)[other] ?? fallback;
          if (v === undefined || v === null || theirs === undefined || theirs === null) return true;
          return ok(v, theirs);
        },
        defaultMessage: (a: ValidationArguments) => `${a.property} ${message} ${other}`,
      },
    });
}

export const IsOnOrAfterField = (other: string, o?: ValidationOptions) =>
  compareWith('isOnOrAfterField', other, (a, b) => day(a) >= day(b), 'must be on or after', undefined, o);

export const IsOnOrBeforeField = (other: string, o?: ValidationOptions) =>
  compareWith('isOnOrBeforeField', other, (a, b) => day(a) <= day(b), 'must be on or before', undefined, o);

export const IsAtMostField = (other: string, fallback?: number, o?: ValidationOptions) =>
  compareWith('isAtMostField', other, (a, b) => a <= b, 'cannot be more than', fallback, o);
