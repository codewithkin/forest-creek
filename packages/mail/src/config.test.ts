import { describe, expect, test } from "bun:test";

import { smtpOptions } from "./config";

describe("smtpOptions", () => {
  test("is null without a host, so the app runs with mail off", () => {
    expect(smtpOptions({})).toBeNull();
  });

  test("defaults to 587 with STARTTLS and sends from the login address", () => {
    expect(
      smtpOptions({ SMTP_HOST: "mail.forestcreek.co.zw", SMTP_USER: "admin@forestcreek.co.zw", SMTP_PASS: "x" }),
    ).toEqual({
      host: "mail.forestcreek.co.zw",
      port: 587,
      secure: false,
      auth: { user: "admin@forestcreek.co.zw", pass: "x" },
      from: "admin@forestcreek.co.zw",
    });
  });

  test("uses implicit TLS on 465", () => {
    expect(smtpOptions({ SMTP_HOST: "h", SMTP_PORT: 465, SMTP_FROM: "a@b.co" })?.secure).toBe(true);
  });

  test("an explicit From wins over the login", () => {
    const options = smtpOptions({
      SMTP_HOST: "h",
      SMTP_USER: "login@b.co",
      SMTP_PASS: "x",
      SMTP_FROM: "Forest Creek <admin@forestcreek.co.zw>",
    });
    expect(options?.from).toBe("Forest Creek <admin@forestcreek.co.zw>");
  });

  test("is null with a host but nobody to send as", () => {
    expect(smtpOptions({ SMTP_HOST: "h" })).toBeNull();
  });

  test("sends without auth when no credentials are given (a local relay)", () => {
    expect(smtpOptions({ SMTP_HOST: "localhost", SMTP_PORT: 25, SMTP_FROM: "a@b.co" })?.auth).toBeUndefined();
  });
});
