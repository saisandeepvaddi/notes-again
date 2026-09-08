export const isNone = (value: unknown): value is undefined | null =>
  value === undefined || value === null;

export const titleCase = (str: string): string => {
  return str[0].toUpperCase() + str.substring(1);
};
