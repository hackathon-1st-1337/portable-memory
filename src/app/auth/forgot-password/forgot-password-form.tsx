"use client";

import { useActionState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/ui/form";
import { requestPasswordReset } from "../actions";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordReset, null);

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
        defaultValue={state?.fields?.email}
      />
      <FormAlert state={state} />
      <SubmitButton pendingLabel="Sending Code…" className="w-full">
        Send Reset Code
      </SubmitButton>
    </form>
  );
}
