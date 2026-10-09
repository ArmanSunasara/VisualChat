// Leave this empty for Vite's local /api proxy. Set VITE_API_BASE_URL when the
// frontend and API are deployed on different domains.
export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
export const apiUrl = (path: string) => `${apiBaseUrl}${path}`;

let tokenGetter: (() => Promise<string | null>) | null = null;
let currentUserId: string | null = null;

export function setAuthContext(
  getter: (() => Promise<string | null>) | null,
  userId: string | null | undefined,
) {
  tokenGetter = getter;
  currentUserId = userId || null;
}

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers || {});
  if (tokenGetter) {
    try {
      const token = await tokenGetter();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    } catch {
      // ignore token retrieval failure
    }
  }
  if (currentUserId) {
    headers.set("X-User-Id", currentUserId);
  }
  return fetch(input, { ...init, headers });
}
