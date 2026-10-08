export class AuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}

export function getOwnerSecret(): string {
  const secret = process.env.FYE_API_SECRET?.trim();
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("FYE_API_SECRET must be set in production");
  }
  return "dev-insecure-fye-secret";
}

export function getIngestSecret(): string {
  const ingest = process.env.FYE_INGEST_SECRET?.trim();
  if (ingest) {
    return ingest;
  }
  return getOwnerSecret();
}

export function extractBearer(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  const apiKey = request.headers.get("x-fye-api-key");
  return apiKey?.trim() ?? null;
}
