import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, SIGN_IN_PATH } from "@/lib/auth/session";
import { listUserPods, ensureDefaultPod } from "@/lib/memory/pods";
import { AuthorizeForm } from "./authorize-form";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "Authorize Application",
};

interface AuthorizePageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default function AuthorizePage({ searchParams }: AuthorizePageProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <Suspense
          fallback={
            <div className="h-64 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm motion-safe:animate-pulse dark:border-zinc-800 dark:bg-zinc-900" />
          }
        >
          <AuthorizeContent searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function AuthorizeContent({ searchParams }: AuthorizePageProps) {
  const params = await searchParams;
  const clientId = String(params.client_id || "");
  const redirectUri = String(params.redirect_uri || "");
  const responseType = String(params.response_type || "");
  const codeChallenge = String(params.code_challenge || "");
  const codeChallengeMethod = String(params.code_challenge_method || "S256");
  const state = String(params.state || "");

  if (!clientId || !redirectUri || !codeChallenge) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
        <h3 className="font-semibold text-rose-900 dark:text-rose-200">Invalid OAuth Request</h3>
        <p className="mt-1">
          Missing required parameters. Required: <code>client_id</code>, <code>redirect_uri</code>, and <code>code_challenge</code>.
        </p>
      </div>
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    // Construct current URL to redirect back after sign-in
    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: responseType || "code",
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      state,
    }).toString();
    redirect(`${SIGN_IN_PATH}?next=${encodeURIComponent(`/oauth/authorize?${query}`)}`);
  }

  let podsList = await listUserPods(user.id);
  if (podsList.length === 0) {
    const defaultPod = await ensureDefaultPod(user.id);
    podsList = [defaultPod];
  }

  return (
    <AuthorizeForm
      clientId={clientId}
      redirectUri={redirectUri}
      codeChallenge={codeChallenge}
      codeChallengeMethod={codeChallengeMethod}
      state={state}
      pods={podsList}
      userName={user.name || user.email}
    />
  );
}
