"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { AFTER_SIGN_IN_PATH, SIGN_IN_PATH } from "@/lib/auth/paths";
import { authErrorMessage, field, thrownAuthErrorMessage, type FormState } from "@/lib/auth/errors";
import { Field, FormAlert, SubmitButton } from "@/components/ui/form";
import { CodeField } from "../code-field";
import { resendVerificationCode } from "../actions";

export function VerifyEmailForm({ email }: { email: string }) {
  const router = useRouter();

  // Browser client: verification may sign the user in, and the session should record this device.
  const [state, formAction] = useActionState(async (_prev: FormState, formData: FormData): Promise<FormState> => {
    const values = { email: field(formData, "email"), otp: field(formData, "otp") };
    const fields = { email: values.email };
    if (!values.email || !values.otp) return { error: "Enter the code from your email.", fields };

    try {
      const { data, error } = await authClient.emailOtp.verifyEmail(values);
      if (error) return { error: authErrorMessage(error, "Couldn’t verify that code. Try again."), fields };

      // Verification signs the user in when the project allows it; otherwise send them to sign in.
      router.push(data && "token" in data && data.token ? AFTER_SIGN_IN_PATH : `${SIGN_IN_PATH}?verified=1`);
      router.refresh();
      return null;
    } catch (err) {
      return { error: thrownAuthErrorMessage(err, "Couldn’t verify that code. Try again."), fields };
    }
  }, null);
  const [resendState, resendAction] = useActionState(resendVerificationCode, null);
  const currentEmail = state?.fields?.email ?? resendState?.fields?.email ?? email;

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          spellCheck={false}
          required
          placeholder="you@example.com…"
          defaultValue={currentEmail}
          key={currentEmail}
        />
        <CodeField invalid={Boolean(state?.error)} />
        <FormAlert state={state} />
        <SubmitButton pendingLabel="Verifying…" className="w-full">
          Verify Email
        </SubmitButton>
      </form>

      <form action={resendAction} className="flex flex-col gap-2">
        <input type="hidden" name="email" value={currentEmail} />
        <FormAlert state={resendState} />
        <SubmitButton variant="secondary" pendingLabel="Sending…" className="w-full" disabled={!currentEmail}>
          Send a New Code
        </SubmitButton>
      </form>
    </div>
  );
}
