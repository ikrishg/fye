import { describe, expect, it } from "vitest";
import { ingestAuthAllowed } from "@/lib/auth-policy";

describe("ingest auth policy", () => {
  const owner = "owner-secret";
  const ingest = "ingest-only-secret";

  it("allows ingest secret", () => {
    const req = new Request("http://localhost/api/ingest", {
      headers: { Authorization: `Bearer ${ingest}` },
    });
    expect(ingestAuthAllowed(req, owner, ingest)).toBe(true);
  });

  it("allows owner secret for dashboard receipt ingest", () => {
    const req = new Request("http://localhost/api/ingest", {
      headers: { Authorization: `Bearer ${owner}` },
    });
    expect(ingestAuthAllowed(req, owner, ingest)).toBe(true);
  });

  it("rejects unknown credentials", () => {
    const req = new Request("http://localhost/api/ingest", {
      headers: { Authorization: "Bearer wrong" },
    });
    expect(ingestAuthAllowed(req, owner, ingest)).toBe(false);
  });
});
