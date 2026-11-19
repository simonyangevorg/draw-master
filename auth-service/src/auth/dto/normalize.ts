import { Transform } from 'class-transformer';

/** Emails are compared case-insensitively: store and look them up trimmed and lower-cased (B-12). */
export const normalizeEmail = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : v);
export const NormalizeEmail = () => Transform(({ value }) => normalizeEmail(value));

/** Trims surrounding whitespace so "   " fails a length check (B-14). */
export const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
