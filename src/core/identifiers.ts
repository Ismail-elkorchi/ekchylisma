export const PACK_ID_PATTERN =
  /^\d{4}-\d{2}-\d{2}--[a-z0-9]+(?:-[a-z0-9]+)*--[0-9a-f]{8}$/;

export const CASE_ID_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*--[a-z0-9]+(?:-[a-z0-9]+)*--[0-9]+--[0-9a-f]{8}$/;

const PLACEHOLDER_TOKEN_PATTERN =
  /\b(?:[Tt][Oo][Dd][Oo]|[Tt][Bb][Dd]|[Ww][Ii][Pp])\b/;

export function isValidPackId(value: string): boolean {
  return PACK_ID_PATTERN.test(value);
}

export function isValidCaseId(value: string): boolean {
  return CASE_ID_PATTERN.test(value);
}

export function containsPlaceholderToken(value: string): boolean {
  return PLACEHOLDER_TOKEN_PATTERN.test(value);
}
