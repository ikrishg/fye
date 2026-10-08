import { cookies } from "next/headers";
import {
  AuthError,
  extractBearer,
  getIngestSecret,
  getOwnerSecret,
} from "./auth";

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

export async function assertIngestAuth(request: Request): Promise<void> {
  const expected = getIngestSecret();
  const provided =
    extractBearer(request) ??
    request.headers.get("x-fye-ingest-secret")?.trim() ??
    null;

  if (!provided || provided !== expected) {
    throw new AuthError("Ingest authentication required");
  }
}
