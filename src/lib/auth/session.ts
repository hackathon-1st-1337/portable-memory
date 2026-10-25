import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./server";
import { SIGN_IN_PATH } from "./paths";

/** The narrow user shape exposed to the rest of the app. Never return the raw session. */
export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
};

export { SIGN_IN_PATH, AFTER_SIGN_IN_PATH } from "./paths";

/**
 * Data Access Layer entry point: reads the session once per request.
 * Reads cookies, so callers must render behind a <Suspense> boundary.
 *
 * In Server Components, only call this on routes matched by `src/proxy.ts`. The middleware keeps
 * the signed session-data cookie fresh, so getSession() is answered from it. Otherwise the SDK
 * goes upstream and may try to set a cookie mid-render, which Next.js rejects.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Mark this as request-time before the SDK runs: during prerender this never resolves,
  // so the SDK doesn't catch and log Next's intentional cookies() rejection.
  await cookies();
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image ?? null,
  };
});

/** For pages and Server Actions: redirects to sign-in when there is no session. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  return user;
}

/**
 * For Route Handlers: returns the user, or a 401 response to send back as-is.
 * Page redirects in proxy.ts are not an authorization check; always call this.
 */
export async function requireApiUser(): Promise<
  { user: CurrentUser; response?: never } | { user?: never; response: Response }
> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { user };
}
