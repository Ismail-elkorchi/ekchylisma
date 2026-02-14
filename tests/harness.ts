type TestFn = () => void | Promise<void>;

type TestCase = {
  name: string;
  fn: TestFn;
};

const tests: TestCase[] = [];

export function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

export function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertEqual<T>(actual: T, expected: T, label = "values differ"): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

export async function assertRejects(
  fn: () => void | Promise<void>,
  predicate: (error: unknown) => boolean,
  label = "expected function to reject",
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (!predicate(error)) {
      throw new Error(`${label}: predicate did not match error ${String(error)}`);
    }
    return;
  }

  throw new Error(label);
}

export async function run(): Promise<void> {
  let failures = 0;

  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (error) {
      failures += 1;
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.error(`not ok - ${name} :: ${detail}`);
    }
  }

  if (failures > 0) {
    throw new Error(`${failures} test(s) failed.`);
  }
}
