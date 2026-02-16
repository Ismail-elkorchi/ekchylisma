import { extractFirstJson } from "./extractJson.ts";

export type RepairStepName =
  | "stripBOM"
  | "removeAsciiControlChars"
  | "trimOuterJunk"
  | "fixTrailingCommas";

export type RepairStep = {
  step: RepairStepName;
  applied: boolean;
  beforeLength: number;
  afterLength: number;
};

export type RepairLog = {
  steps: RepairStep[];
  changed: boolean;
  budget: {
    maxCandidateChars: number | null;
    maxRepairChars: number | null;
    candidateCharsTruncated: boolean;
    repairCharsTruncated: boolean;
  };
};

export type RepairResult = {
  text: string;
  log: RepairLog;
};

export type RepairOptions = {
  maxCandidateChars?: number;
  maxRepairChars?: number;
};

function normalizeLimit(value: number | undefined): number | null {
  if (value === undefined) {
    return null;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Repair budget values must be positive integers.");
  }

  return value;
}

function withStep(
  steps: RepairStep[],
  step: RepairStepName,
  before: string,
  after: string,
): string {
  steps.push({
    step,
    applied: before !== after,
    beforeLength: before.length,
    afterLength: after.length,
  });
  return after;
}

function stripBOM(text: string): string {
  return text.startsWith("\uFEFF") ? text.slice(1) : text;
}

function removeAsciiControlChars(text: string): string {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

function trimOuterJunk(text: string): string {
  const slice = extractFirstJson(text);
  if (!slice) {
    return text.trim();
  }

  return text.slice(slice.start, slice.end);
}

function fixTrailingCommas(text: string): string {
  let output = "";
  let inString = false;
  let escaped = false;
  let changed = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    if (char !== ",") {
      output += char;
      continue;
    }

    let lookahead = index + 1;
    while (lookahead < text.length && /\s/.test(text[lookahead])) {
      lookahead += 1;
    }

    const nextChar = text[lookahead];
    if (nextChar === "]" || nextChar === "}") {
      changed = true;
      continue;
    }

    output += char;
  }

  return changed ? output : text;
}

export function repairJsonText(
  input: string,
  options: RepairOptions = {},
): RepairResult {
  const maxCandidateChars = normalizeLimit(options.maxCandidateChars);
  const maxRepairChars = normalizeLimit(options.maxRepairChars);

  const candidate =
    maxCandidateChars !== null && input.length > maxCandidateChars
      ? input.slice(0, maxCandidateChars)
      : input;

  const candidateCharsTruncated = candidate.length !== input.length;

  const steps: RepairStep[] = [];

  let current = candidate;
  current = withStep(steps, "stripBOM", current, stripBOM(current));
  current = withStep(
    steps,
    "removeAsciiControlChars",
    current,
    removeAsciiControlChars(current),
  );
  current = withStep(steps, "trimOuterJunk", current, trimOuterJunk(current));
  current = withStep(
    steps,
    "fixTrailingCommas",
    current,
    fixTrailingCommas(current),
  );

  const repaired = maxRepairChars !== null && current.length > maxRepairChars
    ? current.slice(0, maxRepairChars)
    : current;
  const repairCharsTruncated = repaired.length !== current.length;

  return {
    text: repaired,
    log: {
      steps,
      changed: steps.some((step) => step.applied) || candidateCharsTruncated ||
        repairCharsTruncated,
      budget: {
        maxCandidateChars,
        maxRepairChars,
        candidateCharsTruncated,
        repairCharsTruncated,
      },
    },
  };
}
