import { ActivityType } from '@prisma/client';
import { HttpError } from './http-error';

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export const validActivityType = (value: unknown): value is ActivityType =>
  typeof value === 'string' && ['STUDY', 'WORKOUT', 'HABIT', 'CUSTOM'].includes(value);

export function textField(value: unknown, name: string, max: number, required = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(400, `${name} is required`);
    return null;
  }
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) {
    throw new HttpError(400, `${name} must contain ${required ? '1' : '0'} to ${max} characters`);
  }
  return value.trim() || null;
}

export function dateOnly(value: unknown): Date | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z)?$/.test(value)) return undefined;
  const key = value.slice(0, 10);
  const date = new Date(`${key}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== key ? undefined : date;
}

export function positiveInteger(value: unknown, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new HttpError(400, 'Invalid pagination');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) throw new HttpError(400, 'Invalid pagination');
  return parsed;
}
