import { afterEach, describe, expect, it } from "vitest";
import { allowDevAutoLogin } from "@/lib/auth-policy";

describe("owner sign-in policy", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("allows dev auto login only when FYE_API_SECRET is unset outside production", () => {
    process.env.NODE_ENV = "development";
    delete process.env.FYE_API_SECRET;
    expect(allowDevAutoLogin()).toBe(true);
  });

  it("disallows dev auto login when FYE_API_SECRET is configured", () => {
    process.env.NODE_ENV = "development";
    process.env.FYE_API_SECRET = "production-like-secret";
    expect(allowDevAutoLogin()).toBe(false);
  });

  it("never allows dev auto login in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.FYE_API_SECRET;
    expect(allowDevAutoLogin()).toBe(false);
  });
});
