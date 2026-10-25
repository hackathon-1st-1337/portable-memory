"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { authErrorMessage, thrownAuthErrorMessage } from "@/lib/auth/errors";
import { Alert, Spinner, buttonClass } from "@/components/ui/form";

/** Google OAuth via the Neon SDK, which handles the popup and session verifier flow. */
export function SocialButtons({ next }: { next: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    setPending(true);
    setError(null);
    try {
      const { error } = await authClient.signIn.social({
        provider: "google",
        // Must be an absolute URL on a trusted domain; relative paths resolve against the Auth URL.
        callbackURL: new URL(next, window.location.origin).toString(),
      });
      if (error) {
        setError(authErrorMessage(error, "Google sign-in failed. Try again or use email instead."));
        setPending(false);
      }
    } catch (err) {
      setError(thrownAuthErrorMessage(err, "Google sign-in failed. Try again or use email instead."));
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={pending}
        className={buttonClass("secondary", "w-full")}
      >
        {pending ? <Spinner /> : <GoogleIcon />}
        {pending ? "Redirecting to Google…" : "Continue with Google"}
      </button>
      <div aria-live="polite" className="empty:hidden">
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </div>
  );
}

export function Divider() {
  return (
    <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
      <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      or
      <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}
