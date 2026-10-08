const DEV_FALLBACK_SECRET = "dev-insecure-fye-secret";

export async function fetchAuthStatus(): Promise<{ allowDevAutoLogin: boolean }> {
  const res = await fetch("/api/auth/status", { credentials: "include" });
  if (!res.ok) {
    return { allowDevAutoLogin: false };
  }
  return (await res.json()) as { allowDevAutoLogin: boolean };
}

export async function signInOwner(secret: string): Promise<boolean> {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret }),
  });
  return res.ok;
}

/** Dev-only auto session when no FYE_API_SECRET is configured on the server. */
export async function ensureOwnerSession(): Promise<boolean> {
  if (typeof window === "undefined") {
    return true;
  }

  const { allowDevAutoLogin } = await fetchAuthStatus();
  if (!allowDevAutoLogin) {
    return false;
  }

  return signInOwner(DEV_FALLBACK_SECRET);
}

export async function ownerFetch(
  input: RequestInfo,
  init?: RequestInit,
): Promise<Response> {
  await ensureOwnerSession();
  return fetch(input, { ...init, credentials: "include" });
}
