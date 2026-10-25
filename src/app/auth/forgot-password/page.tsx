import type { Metadata } from "next";
import { AuthHeading, TextLink } from "../ui";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset Your Password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading
        title="Reset Your Password"
        description="Enter your account email and we’ll send you a code to set a new password."
      />
      <ForgotPasswordForm />
      <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        Remembered it? <TextLink href="/auth/sign-in">Back to Sign In</TextLink>
      </p>
    </>
  );
}
