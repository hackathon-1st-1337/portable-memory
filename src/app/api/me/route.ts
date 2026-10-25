import { requireApiUser } from "@/lib/auth/session";

// Returns the signed-in dashboard user. Agents authenticate with scoped tokens, not this session.
export async function GET() {
  const { user, response } = await requireApiUser();
  if (response) return response;

  return Response.json({
    user: { id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified },
  });
}
