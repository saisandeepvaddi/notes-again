export const isNone = (value: unknown): value is undefined | null =>
  value === undefined || value === null;
