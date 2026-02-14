import { s, type Infer } from "../../src/schema/s.ts";

type Expect<T extends true> = T;

type Extends<A, B> = A extends B ? true : false;

const PersonSchema = s.object({
  id: s.string(),
  age: s.optional(s.number()),
  tags: s.array(s.string()),
});

type Person = Infer<typeof PersonSchema>;
type _PersonCheck = Expect<
  Extends<Person, { id: string; tags: string[]; age?: number | undefined }>
>;
type _PersonCheckReverse = Expect<
  Extends<{ id: string; tags: string[]; age?: number | undefined }, Person>
>;

const VariantSchema = s.union([s.literal("on"), s.literal("off"), s.number()]);
type Variant = Infer<typeof VariantSchema>;
type _VariantCheck = Expect<Extends<Variant, "on" | "off" | number>>;
type _VariantCheckReverse = Expect<Extends<"on" | "off" | number, Variant>>;

void PersonSchema;
void VariantSchema;
