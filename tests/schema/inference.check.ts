import { type Infer, schemaCue } from "../../src/schema/schemaCue.ts";

type Expect<T extends true> = T;

type Extends<A, B> = A extends B ? true : false;

const PersonSchema = schemaCue.object({
  id: schemaCue.string(),
  age: schemaCue.optional(schemaCue.number()),
  tags: schemaCue.array(schemaCue.string()),
});

type Person = Infer<typeof PersonSchema>;
type _PersonCheck = Expect<
  Extends<Person, { id: string; tags: string[]; age?: number | undefined }>
>;
type _PersonCheckReverse = Expect<
  Extends<{ id: string; tags: string[]; age?: number | undefined }, Person>
>;

const VariantSchema = schemaCue.union([
  schemaCue.literal("on"),
  schemaCue.literal("off"),
  schemaCue.number(),
]);
type Variant = Infer<typeof VariantSchema>;
type _VariantCheck = Expect<Extends<Variant, "on" | "off" | number>>;
type _VariantCheckReverse = Expect<Extends<"on" | "off" | number, Variant>>;

void PersonSchema;
void VariantSchema;
