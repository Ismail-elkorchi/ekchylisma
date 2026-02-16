export const PACK_ID_PATTERN =
  /^\d{4}-\d{2}-\d{2}--[a-z0-9]+(?:-[a-z0-9]+)*--[0-9a-f]{8}$/;

export const CASE_ID_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*--[a-z0-9]+(?:-[a-z0-9]+)*--[0-9]+--[0-9a-f]{8}$/;

const PLACEHOLDER_PR_SEGMENT = ["pr", "[-_ ]?\\d+"].join("");
const PLACEHOLDER_TODO_SEGMENT = ["to", "do"].join("");
const PLACEHOLDER_TBD_SEGMENT = ["tb", "d"].join("");
const PLACEHOLDER_WIP_SEGMENT = ["wi", "p"].join("");

const PLACEHOLDER_TOKEN_PATTERN = new RegExp(
  `\\b(?:${PLACEHOLDER_PR_SEGMENT}|${PLACEHOLDER_TODO_SEGMENT}|${PLACEHOLDER_TBD_SEGMENT}|${PLACEHOLDER_WIP_SEGMENT})\\b`,
  "i",
);

export function isValidPackId(value: string): boolean {
  return PACK_ID_PATTERN.test(value);
}

export function isValidCaseId(value: string): boolean {
  return CASE_ID_PATTERN.test(value);
}

export function containsPlaceholderToken(value: string): boolean {
  return PLACEHOLDER_TOKEN_PATTERN.test(value);
}
