import { extractBearer } from "./auth";

export function allowDevAutoLogin(): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return !process.env.FYE_API_SECRET?.trim();
}

export function ingestAuthAllowed(
  request: Request,
  ownerSecret: string,
  ingestSecret: string,
  sessionCookie?: string | null,
): boolean {
  const provided =
    extractBearer(request) ??
    request.headers.get("x-fye-ingest-secret")?.trim() ??
    sessionCookie ??
    null;

  if (!provided) {
    return false;
  }

  return provided === ownerSecret || provided === ingestSecret;
}
