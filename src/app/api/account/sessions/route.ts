import { requireApiUser } from "@/lib/auth/session";
import { listOwnSessions } from "@/lib/auth/account";

// A Route Handler (not a Server Component) because listing sessions may refresh auth cookies.
export async function GET() {
  const { response } = await requireApiUser();
  if (response) return response;

  const sessions = await listOwnSessions();
  if (!sessions) {
    return Response.json({ error: "Couldn’t load sessions." }, { status: 502 });
  }
  return Response.json({ sessions }, { headers: { "Cache-Control": "no-store" } });
}
