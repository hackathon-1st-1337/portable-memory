"use client";

import { Field } from "@/components/ui/form";

/** One-time code input: numeric keypad on mobile, autofill from SMS/email where supported. */
export function CodeField({ invalid }: { invalid?: boolean }) {
  return (
    <Field
      label="Verification Code"
      name="otp"
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      spellCheck={false}
      pattern="[0-9]*"
      maxLength={10}
      required
      placeholder="123456…"
      className="font-mono tracking-[0.3em]"
      aria-invalid={invalid ? true : undefined}
    />
  );
}
