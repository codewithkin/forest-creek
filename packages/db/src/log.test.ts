import { describe, expect, test } from "bun:test";

import { describeError } from "./log";

describe("describeError", () => {
  test("keeps a Prisma error's call and reason but drops the arguments between them", () => {
    const error = Object.assign(
      new Error(
        [
          "",
          "Invalid `prisma.notification.createMany()` invocation:",
          "",
          "{",
          '  data: [{ recipient: "tariro@example.com", body: "Hello Tariro, your mobile money 0771234567" }]',
          "}",
          "",
          "Unique constraint failed on the fields: (`bookingId`,`event`,`recipient`)",
        ].join("\n"),
      ),
      { name: "PrismaClientKnownRequestError", code: "P2002" },
    );

    const line = describeError(error);
    expect(line).toContain("PrismaClientKnownRequestError [P2002]");
    expect(line).toContain("prisma.notification.createMany()");
    expect(line).toContain("Unique constraint failed");
    expect(line).not.toContain("tariro@example.com");
    expect(line).not.toContain("0771234567");
  });

  test("never prints what an AI provider error carries about the request", () => {
    const error = Object.assign(new Error("Provider returned error"), {
      name: "AI_APICallError",
      statusCode: 429,
      requestBodyValues: { messages: [{ role: "user", content: "my ecocash is 0779998887" }] },
      responseBody: '{"error":"rate limited"}',
    });
    const line = describeError(error);
    expect(line).toStartWith("AI_APICallError (HTTP 429): Provider returned error");
    expect(line).not.toContain("0779998887");
  });

  test("keeps stack frames, which are code locations, not data", () => {
    const line = describeError(new Error("boom"));
    expect(line).toContain("Error: boom");
    expect(line).toMatch(/\n\s+at /);
  });

  test("handles things that are not errors", () => {
    expect(describeError("plain failure\nsecond line")).toBe("plain failure");
    expect(describeError({ email: "x@y.co" })).toBe("non-error value thrown");
  });
});
