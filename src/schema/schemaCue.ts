export type JsonPrimitive = string | number | boolean | null;

export interface StringSchema {
  kind: "string";
}

export interface NumberSchema {
  kind: "number";
}

export interface BooleanSchema {
  kind: "boolean";
}

export interface LiteralSchema<TValue extends JsonPrimitive = JsonPrimitive> {
  kind: "literal";
  value: TValue;
}

export interface EnumSchema<
  TValues extends readonly [JsonPrimitive, ...JsonPrimitive[]] = readonly [
    JsonPrimitive,
    ...JsonPrimitive[],
  ],
> {
  kind: "enum";
  values: TValues;
}

export interface ArraySchema<TItem extends SchemaAny = SchemaAny> {
  kind: "array";
  item: TItem;
}

export interface OptionalSchema<TInner extends SchemaAny = SchemaAny> {
  kind: "optional";
  inner: TInner;
}

export interface ObjectShape {
  [key: string]: SchemaAny;
}

export interface ObjectSchema<TShape extends ObjectShape = ObjectShape> {
  kind: "object";
  shape: TShape;
}

export interface UnionSchema<
  TOptions extends readonly [SchemaAny, SchemaAny, ...SchemaAny[]] = readonly [
    SchemaAny,
    SchemaAny,
    ...SchemaAny[],
  ],
> {
  kind: "union";
  options: TOptions;
}

export type SchemaAny =
  | StringSchema
  | NumberSchema
  | BooleanSchema
  | LiteralSchema
  | EnumSchema
  | ArraySchema
  | ObjectSchema
  | UnionSchema
  | OptionalSchema;

type RequiredKeys<TShape extends ObjectShape> = {
  [TKey in keyof TShape]-?: TShape[TKey] extends OptionalSchema ? never : TKey;
}[keyof TShape];

type OptionalKeys<TShape extends ObjectShape> = {
  [TKey in keyof TShape]-?: TShape[TKey] extends OptionalSchema ? TKey : never;
}[keyof TShape];

type InferOptionalValue<TSchema extends SchemaAny> = TSchema extends
  OptionalSchema<infer TInner> ? Infer<TInner>
  : Infer<TSchema>;

type Simplify<TValue> =
  & {
    [TKey in keyof TValue]: TValue[TKey];
  }
  & {};

type InferObject<TShape extends ObjectShape> = Simplify<
  & {
    [TKey in RequiredKeys<TShape>]: Infer<TShape[TKey]>;
  }
  & {
    [TKey in OptionalKeys<TShape>]?: InferOptionalValue<TShape[TKey]>;
  }
>;

export type Infer<TSchema extends SchemaAny> = TSchema extends StringSchema
  ? string
  : TSchema extends NumberSchema ? number
  : TSchema extends BooleanSchema ? boolean
  : TSchema extends LiteralSchema<infer TValue> ? TValue
  : TSchema extends EnumSchema<infer TValues> ? TValues[number]
  : TSchema extends ArraySchema<infer TItem> ? Array<Infer<TItem>>
  : TSchema extends ObjectSchema<infer TShape> ? InferObject<TShape>
  : TSchema extends UnionSchema<infer TOptions> ? Infer<TOptions[number]>
  : TSchema extends OptionalSchema<infer TInner> ? Infer<TInner> | undefined
  : never;

export const string = (): StringSchema => ({ kind: "string" });

export const number = (): NumberSchema => ({ kind: "number" });

export const boolean = (): BooleanSchema => ({ kind: "boolean" });

export const literal = <const TValue extends JsonPrimitive>(
  value: TValue,
): LiteralSchema<TValue> => ({ kind: "literal", value });

const enumValue = <
  const TValues extends readonly [JsonPrimitive, ...JsonPrimitive[]],
>(
  values: TValues,
): EnumSchema<TValues> => ({
  kind: "enum",
  values,
});

export const array = <const TItem extends SchemaAny>(
  item: TItem,
): ArraySchema<TItem> => ({ kind: "array", item });

export const object = <const TShape extends ObjectShape>(
  shape: TShape,
): ObjectSchema<TShape> => ({ kind: "object", shape });

export const union = <
  const TOptions extends readonly [SchemaAny, SchemaAny, ...SchemaAny[]],
>(
  options: TOptions,
): UnionSchema<TOptions> => ({ kind: "union", options });

export const optional = <const TInner extends SchemaAny>(
  inner: TInner,
): OptionalSchema<TInner> => ({ kind: "optional", inner });

export const schemaCue = {
  string,
  number,
  boolean,
  literal,
  enum: enumValue,
  array,
  object,
  union,
  optional,
} as const;
