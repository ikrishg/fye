import { afterEach, describe, expect, it, vi } from "vitest";
import { allowDevAutoLogin } from "@/lib/auth-policy";

describe("owner sign-in policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows dev auto login only when FYE_API_SECRET is unset outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("FYE_API_SECRET", "");
    expect(allowDevAutoLogin()).toBe(true);
  });

  it("disallows dev auto login when FYE_API_SECRET is configured", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("FYE_API_SECRET", "production-like-secret");
    expect(allowDevAutoLogin()).toBe(false);
  });

  it("never allows dev auto login in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FYE_API_SECRET", "");
    expect(allowDevAutoLogin()).toBe(false);
  });
});
