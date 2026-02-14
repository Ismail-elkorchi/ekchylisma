export const invalidControlCharFixture = "{\"value\":\"a\u0001b\"}";

export const unterminatedStringFixture = "{\"value\":\"missing-end}";

export const wrappedJsonFixture = "header text\n{\"ok\": true,}\ntrailing notes";

export const jsonFixture = "{\"alpha\":1,\"beta\":[2,3]}";

export const jsonlFixture = "{\"line\":1}\n{\"line\":2}";
