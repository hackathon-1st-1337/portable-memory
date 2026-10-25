"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps, ReactNode } from "react";
import type { FormState } from "@/lib/auth/errors";
import { buttonClass, type ButtonVariant } from "./styles";

export { buttonClass };

const inputClass =
  "block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-xs " +
  "placeholder:text-zinc-400 transition-[border-color,box-shadow] " +
  "focus-visible:border-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 " +
  "aria-[invalid=true]:border-red-500 " +
  "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 " +
  "dark:focus-visible:border-zinc-100 dark:focus-visible:ring-zinc-100/20";

type FieldProps = Omit<ComponentProps<"input">, "name" | "id"> & {
  label: string;
  name: string;
  hint?: ReactNode;
  /** Extra element rendered beside the label, e.g. a "Forgot password?" link. */
  labelAside?: ReactNode;
};

export function Field({ label, name, hint, labelAside, className = "", ...inputProps }: FieldProps) {
  const id = `field-${name}`;
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {label}
        </label>
        {labelAside}
      </div>
      <input
        id={id}
        name={name}
        aria-describedby={hintId}
        className={`${inputClass} ${className}`}
        {...inputProps}
      />
      {hint && (
        <p id={hintId} className="text-xs text-zinc-500 dark:text-zinc-400">
          {hint}
        </p>
      )}
    </div>
  );
}

type SubmitButtonProps = Omit<ComponentProps<"button">, "type"> & {
  pendingLabel: string;
  variant?: ButtonVariant;
};

/** Stays enabled until the request starts, then shows a spinner and pending label. */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className = "",
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || props.disabled}
      aria-disabled={pending}
      className={buttonClass(variant, className)}
      {...props}
    >
      {pending && <Spinner />}
      {pending ? pendingLabel : children}
    </button>
  );
}

export function Spinner() {
  return (
    <svg
      aria-hidden="true"
      className="size-4 animate-spin motion-reduce:animate-none"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** Announces form results to screen readers; renders nothing when there is no message. */
export function FormAlert({ state }: { state: FormState }) {
  return (
    <div aria-live="polite" role="status" className="empty:hidden">
      {state?.error && <Alert tone="error">{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}
    </div>
  );
}

export function Alert({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const tones = {
    error: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300",
    success:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300",
    info: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
  };
  return <p className={`rounded-md border px-3 py-2 text-sm text-pretty ${tones[tone]}`}>{children}</p>;
}
