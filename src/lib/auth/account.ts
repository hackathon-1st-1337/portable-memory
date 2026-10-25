import "server-only";
import { auth } from "./server";

// These calls always reach Managed Auth, which may refresh cookies in its response.
// Call them only from Route Handlers or Server Actions, never during a Server Component render:
// the SDK writes those cookies unconditionally, and Next.js forbids that while rendering.

export type ActiveSession = {
  id: string;
  current: boolean;
  device: string;
  createdAt: string;
};

/**
 * The signed-in user's sessions, without exposing session tokens to the browser.
 * IP addresses are omitted: Managed Auth sees the app server's address, not the visitor's.
 */
export async function listOwnSessions(): Promise<ActiveSession[] | null> {
  const [{ data: current }, { data: sessions, error }] = await Promise.all([
    auth.getSession(),
    auth.listSessions(),
  ]);
  if (error || !current?.session) return null;

  return (sessions ?? [])
    .map((s) => ({
      id: s.id,
      current: s.id === current.session.id,
      device: describeUserAgent(s.userAgent ?? null),
      createdAt: new Date(s.createdAt).toISOString(),
    }))
    .sort((a, b) => Number(b.current) - Number(a.current) || b.createdAt.localeCompare(a.createdAt));
}

/** Resolves a session id to its token server-side, scoped to the signed-in user's own sessions. */
export async function findOwnSessionToken(sessionId: string): Promise<string | null> {
  const { data: sessions } = await auth.listSessions();
  return sessions?.find((s) => s.id === sessionId)?.token ?? null;
}

function describeUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /Firefox\//.test(ua) ? "Firefox" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Safari\//.test(ua) ? "Safari" :
    /curl\//.test(ua) ? "curl" : "Browser";
  const os =
    /Windows/.test(ua) ? "Windows" :
    /iPhone|iPad/.test(ua) ? "iOS" :
    /Android/.test(ua) ? "Android" :
    /Mac OS X/.test(ua) ? "macOS" :
    /Linux/.test(ua) ? "Linux" : null;
  return os ? `${browser} on ${os}` : browser;
}
