import type { NormalizationLedger, NormalizationStep } from "./types.ts";

export type NormalizationResult = {
  text: string;
  ledger: NormalizationLedger;
};

function buildStep(
  step: NormalizationStep["step"],
  before: string,
  after: string,
): NormalizationStep {
  return {
    step,
    mappingStrategy: "not_reversible",
    lossy: before !== after,
    beforeLength: before.length,
    afterLength: after.length,
  };
}

export function normalizeNewlines(text: string): NormalizationResult {
  const normalized = text.replace(/\r\n?/g, "\n");
  return {
    text: normalized,
    ledger: {
      steps: [buildStep("normalizeNewlines", text, normalized)],
    },
  };
}

export function trimTrailingWhitespacePerLine(text: string): NormalizationResult {
  const normalized = text.replace(/[\t ]+$/gm, "");
  return {
    text: normalized,
    ledger: {
      steps: [
        buildStep("trimTrailingWhitespacePerLine", text, normalized),
      ],
    },
  };
}

export function normalizeText(
  text: string,
  options: { trimTrailingWhitespacePerLine?: boolean } = {},
): NormalizationResult {
  const steps: NormalizationStep[] = [];

  const newlines = normalizeNewlines(text);
  steps.push(...newlines.ledger.steps);

  if (!options.trimTrailingWhitespacePerLine) {
    return {
      text: newlines.text,
      ledger: { steps },
    };
  }

  const trimmed = trimTrailingWhitespacePerLine(newlines.text);
  steps.push(...trimmed.ledger.steps);

  return {
    text: trimmed.text,
    ledger: { steps },
  };
}
