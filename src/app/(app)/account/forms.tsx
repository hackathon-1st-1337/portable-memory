"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActiveSession } from "@/lib/auth/account";
import type { FormState } from "@/lib/auth/errors";
import { Alert, Field, FormAlert, SubmitButton } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/styles";
import { changePassword, revokeOtherSessions, revokeSession, updateProfile } from "./actions";

const SESSIONS_CHANGED = "pm:sessions-changed";

/** Runs `onSuccess` once per successful action result. */
function useOnSuccess(state: FormState, onSuccess: () => void) {
  useEffect(() => {
    if (state?.success) onSuccess();
  }, [state, onSuccess]);
}

export function ProfileForm({
  name,
  email,
  emailVerified,
}: {
  name: string;
  email: string;
  emailVerified: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(updateProfile, null);
  // Re-render server components (the header shows the name) with the updated session cookie.
  useOnSuccess(state, useCallback(() => router.refresh(), [router]));

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field
        label="Name"
        name="name"
        type="text"
        autoComplete="name"
        required
        maxLength={100}
        defaultValue={state?.fields?.name ?? name}
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Email</span>
        <p className="flex min-w-0 items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <span className="truncate">{email}</span>
          <span
            className={
              "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium " +
              (emailVerified
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300")
            }
          >
            {emailVerified ? "Verified" : "Unverified"}
          </span>
        </p>
      </div>
      <FormAlert state={state} />
      <div>
        <SubmitButton pendingLabel="Saving…">Save Name</SubmitButton>
      </div>
    </form>
  );
}

export function PasswordForm({ email }: { email: string }) {
  const [state, formAction] = useActionState(changePassword, null);
  // Other sessions were revoked; let the session list refetch.
  useOnSuccess(state, useCallback(() => window.dispatchEvent(new Event(SESSIONS_CHANGED)), []));

  return (
    // Keyed on the result so a successful change clears the password fields.
    <form key={state?.success ?? "password"} action={formAction} className="flex flex-col gap-4">
      {/* Lets password managers file the new password under this account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <Field
        label="Current Password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
      />
      <Field
        label="New Password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={128}
        hint="At least 8 characters."
      />
      <FormAlert state={state} />
      <div>
        <SubmitButton pendingLabel="Changing Password…">Change Password</SubmitButton>
      </div>
    </form>
  );
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; sessions: ActiveSession[] };

async function loadSessions(): Promise<LoadState | "unauthorized"> {
  try {
    const res = await fetch("/api/account/sessions", { cache: "no-store" });
    if (res.status === 401) return "unauthorized";
    if (!res.ok) throw new Error(String(res.status));
    const body: { sessions: ActiveSession[] } = await res.json();
    return { status: "ready", sessions: body.sessions };
  } catch {
    return { status: "error", message: "Couldn’t load your sessions. Check your connection and try again." };
  }
}

export function SessionList() {
  const router = useRouter();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  // Bumping the version refetches; the previous list stays visible meanwhile.
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const [state, revokeAction] = useActionState(revokeSession, null);
  const [othersState, revokeOthersAction] = useActionState(revokeOtherSessions, null);

  useEffect(() => {
    let cancelled = false;
    loadSessions().then((result) => {
      if (cancelled) return;
      if (result === "unauthorized") router.push("/auth/sign-in?next=/account");
      else setLoad(result);
    });
    return () => {
      cancelled = true;
    };
  }, [version, router]);

  useEffect(() => {
    window.addEventListener(SESSIONS_CHANGED, reload);
    return () => window.removeEventListener(SESSIONS_CHANGED, reload);
  }, [reload]);
  useOnSuccess(state, reload);
  useOnSuccess(othersState, reload);

  if (load.status === "loading") {
    return <div aria-busy="true" aria-label="Loading sessions…" className="h-24 rounded-md bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-900" />;
  }
  if (load.status === "error") {
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert tone="error">{load.message}</Alert>
        <button type="button" onClick={reload} className={buttonClass("secondary")}>
          Try Again
        </button>
      </div>
    );
  }

  const { sessions } = load;
  if (sessions.length === 0) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">No active sessions found.</p>;
  }

  const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
  const hasOthers = sessions.some((s) => !s.current);

  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {sessions.map((s) => {
          const signedIn = formatter.format(new Date(s.createdAt));
          return (
            <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex min-w-0 flex-col">
                <span className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  <span className="truncate">{s.device}</span>
                  {s.current && (
                    <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      This device
                    </span>
                  )}
                </span>
                <span className="truncate text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                  Signed in <time dateTime={s.createdAt}>{signedIn}</time>
                </span>
              </div>
              {!s.current && (
                <form action={revokeAction} className="shrink-0">
                  <input type="hidden" name="sessionId" value={s.id} />
                  <SubmitButton
                    variant="secondary"
                    pendingLabel="Signing Out…"
                    className="px-3 py-1.5"
                    aria-label={`Sign out ${s.device}, signed in ${signedIn}`}
                  >
                    Sign Out
                  </SubmitButton>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      <FormAlert state={state} />
      {hasOthers && (
        <form
          action={revokeOthersAction}
          onSubmit={(e) => {
            if (!window.confirm("Sign out every other device? They’ll need to sign in again.")) {
              e.preventDefault();
            }
          }}
        >
          <SubmitButton variant="danger" pendingLabel="Signing Out…">
            Sign Out All Other Devices
          </SubmitButton>
        </form>
      )}
      <FormAlert state={othersState} />
    </div>
  );
}
