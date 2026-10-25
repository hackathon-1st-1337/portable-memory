"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { AFTER_SIGN_IN_PATH } from "@/lib/auth/paths";
import { authErrorMessage, field, secret, thrownAuthErrorMessage, type FormState } from "@/lib/auth/errors";
import { Field, FormAlert, SubmitButton } from "@/components/ui/form";

export function SignUpForm() {
  const router = useRouter();

  // Browser client via the /api/auth proxy, so the first session records the real device.
  const [state, formAction] = useActionState(async (_prev: FormState, formData: FormData): Promise<FormState> => {
    const name = field(formData, "name");
    const email = field(formData, "email");
    const password = secret(formData, "password");
    const fields = { name, email };

    if (!name || !email || !password) return { error: "Fill in your name, email, and password.", fields };
    if (password.length < 8) return { error: "Use a password with at least 8 characters.", fields };

    try {
      const { data, error } = await authClient.signUp.email({ name, email, password });
      if (error) return { error: authErrorMessage(error, "Couldn’t create your account. Try again."), fields };

      // No session token means the project requires email verification before sign-in.
      if (!data?.token) {
        router.push(`/auth/verify-email?email=${encodeURIComponent(email)}`);
        return null;
      }
    } catch (err) {
      return { error: thrownAuthErrorMessage(err, "Couldn’t create your account. Try again."), fields };
    }

    router.push(AFTER_SIGN_IN_PATH);
    router.refresh();
    return null;
  }, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field
        label="Name"
        name="name"
        type="text"
        autoComplete="name"
        required
        maxLength={100}
        placeholder="Alex Rivera…"
        defaultValue={state?.fields?.name}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        spellCheck={false}
        required
        placeholder="you@example.com…"
        defaultValue={state?.fields?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={128}
        hint="At least 8 characters."
      />
      <FormAlert state={state} />
      <SubmitButton pendingLabel="Creating Account…" className="w-full">
        Create Account
      </SubmitButton>
    </form>
  );
}
