import { auth } from "@/lib/auth/server";

// Redirects signed-out visitors away from protected pages and refreshes the session cookie.
// This is a UX guard only: pages, Server Actions, and Route Handlers re-check the session.
export default auth.middleware({ loginUrl: "/auth/sign-in" });

export const config = {
  // Keep /auth/*, /api/auth/*, and static assets reachable without a session.
  matcher: ["/dashboard/:path*", "/account/:path*"],
};
