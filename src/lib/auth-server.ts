import { cookies } from "next/headers";
import {
  AuthError,
  extractBearer,
  getIngestSecret,
  getOwnerSecret,
} from "./auth";
import { ingestAuthAllowed } from "./auth-policy";

export async function assertOwnerAuth(request: Request): Promise<void> {
  const expected = getOwnerSecret();
  const provided =
    extractBearer(request) ??
    (await cookies()).get("fye_session")?.value ??
    null;

  if (!provided || provided !== expected) {
    throw new AuthError();
  }
}

export async function assertIngestOrOwnerAuth(request: Request): Promise<void> {
  const ownerSecret = getOwnerSecret();
  const ingestSecret = getIngestSecret();
  const sessionCookie = (await cookies()).get("fye_session")?.value ?? null;

  if (
    ingestAuthAllowed(request, ownerSecret, ingestSecret, sessionCookie)
  ) {
    return;
  }

  throw new AuthError("Ingest authentication required");
}
