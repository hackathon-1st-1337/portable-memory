"use client";

import { useActionState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import {
  authErrorMessage,
  field,
  isEmailNotVerified,
  secret,
  thrownAuthErrorMessage,
  type FormState,
} from "@/lib/auth/errors";
import { Alert, Field, FormAlert, SubmitButton } from "@/components/ui/form";

export function SignInForm({
  next,
  notice,
  forgotLink,
}: {
  next: string;
  notice?: string;
  forgotLink: ReactNode;
}) {
  const router = useRouter();

  // Runs in the browser through the /api/auth proxy, which forwards the browser's user agent,
  // so the new session shows the real device under Account → Active Sessions.
  const [state, formAction] = useActionState(async (_prev: FormState, formData: FormData): Promise<FormState> => {
    const email = field(formData, "email");
    const password = secret(formData, "password");
    if (!email || !password) return { error: "Enter your email and password.", fields: { email } };

    try {
      const { error } = await authClient.signIn.email({ email, password });
      if (error) {
        if (isEmailNotVerified(error)) {
          await authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" });
          router.push(`/auth/verify-email?email=${encodeURIComponent(email)}`);
          return null;
        }
        return { error: authErrorMessage(error, "Sign-in failed. Try again."), fields: { email } };
      }
    } catch (err) {
      return { error: thrownAuthErrorMessage(err, "Sign-in failed. Try again."), fields: { email } };
    }

    router.push(next);
    router.refresh();
    return null;
  }, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {notice && !state && <Alert tone="success">{notice}</Alert>}
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        spellCheck={false}
        required
        placeholder="you@example.com…"
        defaultValue={state?.fields?.email}
        aria-invalid={state?.error ? true : undefined}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        labelAside={forgotLink}
        aria-invalid={state?.error ? true : undefined}
      />
      <FormAlert state={state} />
      <SubmitButton pendingLabel="Signing In…" className="w-full">
        Sign In
      </SubmitButton>
    </form>
  );
}
