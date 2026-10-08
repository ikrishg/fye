export function ownerAuthHeaders(): HeadersInit {
  if (typeof window === "undefined") {
    return {};
  }
  const fromSession = window.sessionStorage.getItem("fye_api_secret");
  if (!fromSession) {
    return {};
  }
  return { Authorization: `Bearer ${fromSession}` };
}

export async function ensureOwnerSession(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }
  if (window.sessionStorage.getItem("fye_api_secret")) {
    return;
  }
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: "dev-insecure-fye-secret" }),
  });
  if (res.ok) {
    window.sessionStorage.setItem("fye_api_secret", "dev-insecure-fye-secret");
  }
}

export async function ownerFetch(
  input: RequestInfo,
  init?: RequestInit,
): Promise<Response> {
  await ensureOwnerSession();
  const headers = new Headers(init?.headers);
  const auth = ownerAuthHeaders();
  for (const [key, value] of Object.entries(auth)) {
    if (!headers.has(key)) {
      headers.set(key, value as string);
    }
  }
  return fetch(input, { ...init, headers });
}
