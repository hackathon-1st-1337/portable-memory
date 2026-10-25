"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { authErrorMessage, field, secret, thrownAuthErrorMessage, type FormState } from "@/lib/auth/errors";
import { Field, FormAlert, SubmitButton } from "@/components/ui/form";
import { CodeField } from "../code-field";

export function ResetPasswordForm({ email }: { email: string }) {
  const router = useRouter();

  // Runs in the browser: the server SDK's emailOtp.resetPassword targets an endpoint
  // Managed Auth doesn't serve, while the client calls /email-otp/reset-password via the proxy.
  const [state, formAction] = useActionState(async (_prev: FormState, formData: FormData): Promise<FormState> => {
    const values = { email: field(formData, "email"), otp: field(formData, "otp") };
    const password = secret(formData, "password");
    const fields = { email: values.email };

    if (!values.email || !values.otp || !password) {
      return { error: "Enter the code from your email and a new password.", fields };
    }
    if (password.length < 8) return { error: "Use a password with at least 8 characters.", fields };

    try {
      const { error } = await authClient.emailOtp.resetPassword({ ...values, password });
      if (error) return { error: authErrorMessage(error, "Couldn’t reset your password. Try again."), fields };
    } catch (err) {
      return { error: thrownAuthErrorMessage(err, "Couldn’t reset your password. Try again."), fields };
    }

    router.push("/auth/sign-in?reset=1");
    return null;
  }, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        spellCheck={false}
        required
        placeholder="you@example.com…"
        defaultValue={state?.fields?.email ?? email}
      />
      <CodeField invalid={Boolean(state?.error)} />
      <Field
        label="New Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={128}
        hint="At least 8 characters."
      />
      <FormAlert state={state} />
      <SubmitButton pendingLabel="Updating Password…" className="w-full">
        Update Password
      </SubmitButton>
    </form>
  );
}
