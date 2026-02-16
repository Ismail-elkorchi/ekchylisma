export type AssembledToolCall = {
  index: number;
  id: string | null;
  name: string | null;
  arguments: string;
};

type ToolCallDelta = {
  index: number | null;
  id: string | null;
  name: string | null;
  appendArguments: string | null;
  replaceArguments: string | null;
};

type MutableToolCall = {
  order: number;
  index: number;
  id: string | null;
  name: string | null;
  arguments: string;
};

function toStringArguments(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return null;
}

function parseInteger(value: unknown): number | null {
  return Number.isInteger(value) ? (value as number) : null;
}

function parseToolCallDelta(value: unknown): ToolCallDelta[] {
  if (typeof value !== "object" || value === null) {
    return [];
  }

  const frame = value as Record<string, unknown>;
  const deltas: ToolCallDelta[] = [];

  const choices = frame.choices;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      const delta = (choice as { delta?: unknown }).delta;
      const toolCalls = typeof delta === "object" && delta !== null
        ? (delta as { tool_calls?: unknown }).tool_calls
        : null;
      if (!Array.isArray(toolCalls)) {
        continue;
      }

      for (const call of toolCalls) {
        const callRecord = call as {
          index?: unknown;
          id?: unknown;
          function?: { name?: unknown; arguments?: unknown };
        };
        const appendArguments = toStringArguments(
          callRecord.function?.arguments,
        );
        deltas.push({
          index: parseInteger(callRecord.index),
          id: typeof callRecord.id === "string" ? callRecord.id : null,
          name: typeof callRecord.function?.name === "string"
            ? callRecord.function.name
            : null,
          appendArguments,
          replaceArguments: null,
        });
      }
    }
  }

  const candidates = frame.candidates;
  if (Array.isArray(candidates)) {
    for (const candidate of candidates) {
      const parts = (candidate as { content?: { parts?: unknown } }).content
        ?.parts;
      if (!Array.isArray(parts)) {
        continue;
      }

      for (const part of parts) {
        const functionCall = (part as { functionCall?: unknown }).functionCall;
        if (typeof functionCall !== "object" || functionCall === null) {
          continue;
        }

        const args = (functionCall as { args?: unknown }).args;
        const stringArguments = toStringArguments(args);
        if (stringArguments === null) {
          continue;
        }

        deltas.push({
          index: null,
          id: null,
          name: typeof (functionCall as { name?: unknown }).name === "string"
            ? (functionCall as { name: string }).name
            : null,
          appendArguments: typeof args === "string" ? stringArguments : null,
          replaceArguments: typeof args === "string" ? null : stringArguments,
        });
      }
    }
  }

  const event = typeof frame.event === "string" ? frame.event : null;
  if (event === "response.output_item.added") {
    const item = typeof frame.item === "object" && frame.item !== null
      ? frame.item as Record<string, unknown>
      : null;
    if (item && (item.type === "function_call" || item.type === "tool_call")) {
      const argumentsValue = toStringArguments(item.arguments);
      if (argumentsValue !== null) {
        deltas.push({
          index: parseInteger(item.output_index ?? item.index),
          id: typeof item.id === "string"
            ? item.id
            : typeof item.call_id === "string"
            ? item.call_id
            : null,
          name: typeof item.name === "string" ? item.name : null,
          appendArguments: argumentsValue,
          replaceArguments: null,
        });
      }
    }
  } else if (event === "response.function_call_arguments.delta") {
    const delta = typeof frame.delta === "string" ? frame.delta : null;
    if (delta !== null) {
      deltas.push({
        index: parseInteger(frame.output_index ?? frame.index),
        id: typeof frame.item_id === "string"
          ? frame.item_id
          : typeof frame.id === "string"
          ? frame.id
          : null,
        name: null,
        appendArguments: delta,
        replaceArguments: null,
      });
    }
  } else if (event === "response.function_call_arguments.done") {
    const argumentsValue = toStringArguments(frame.arguments);
    if (argumentsValue !== null) {
      deltas.push({
        index: parseInteger(frame.output_index ?? frame.index),
        id: typeof frame.item_id === "string"
          ? frame.item_id
          : typeof frame.id === "string"
          ? frame.id
          : null,
        name: null,
        appendArguments: null,
        replaceArguments: argumentsValue,
      });
    }
  }

  const message = typeof frame.message === "object" && frame.message !== null
    ? frame.message as Record<string, unknown>
    : null;
  if (Array.isArray(message?.tool_calls)) {
    for (const call of message.tool_calls) {
      const record = call as {
        index?: unknown;
        id?: unknown;
        function?: { name?: unknown; arguments?: unknown };
      };
      const replacement = toStringArguments(record.function?.arguments);
      if (replacement === null) {
        continue;
      }

      deltas.push({
        index: parseInteger(record.index),
        id: typeof record.id === "string" ? record.id : null,
        name: typeof record.function?.name === "string"
          ? record.function.name
          : null,
        appendArguments: null,
        replaceArguments: replacement,
      });
    }
  }

  return deltas;
}

function ensureSlot(
  slotsById: Map<string, MutableToolCall>,
  slotsByIndex: Map<number, MutableToolCall>,
  slots: MutableToolCall[],
  delta: ToolCallDelta,
): MutableToolCall {
  let slot: MutableToolCall | undefined;
  if (delta.id !== null) {
    slot = slotsById.get(delta.id);
  }
  if (!slot && delta.index !== null) {
    slot = slotsByIndex.get(delta.index);
  }

  if (!slot) {
    const derivedIndex = delta.index ?? slots.length;
    slot = {
      order: slots.length,
      index: derivedIndex,
      id: delta.id,
      name: delta.name,
      arguments: "",
    };
    slots.push(slot);
  }

  if (delta.id !== null) {
    slot.id = delta.id;
    slotsById.set(delta.id, slot);
  }
  if (delta.index !== null) {
    slot.index = delta.index;
    slotsByIndex.set(delta.index, slot);
  }
  if (delta.name !== null && slot.name === null) {
    slot.name = delta.name;
  }

  return slot;
}

export function assembleStreamingToolCalls(
  frames: unknown[],
): AssembledToolCall[] {
  const slotsById = new Map<string, MutableToolCall>();
  const slotsByIndex = new Map<number, MutableToolCall>();
  const slots: MutableToolCall[] = [];

  for (const frame of frames) {
    const deltas = parseToolCallDelta(frame);
    for (const delta of deltas) {
      const slot = ensureSlot(slotsById, slotsByIndex, slots, delta);
      if (delta.replaceArguments !== null) {
        slot.arguments = delta.replaceArguments;
      }
      if (delta.appendArguments !== null) {
        slot.arguments += delta.appendArguments;
      }
    }
  }

  return slots
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((slot) => ({
      index: slot.index,
      id: slot.id,
      name: slot.name,
      arguments: slot.arguments,
    }));
}
