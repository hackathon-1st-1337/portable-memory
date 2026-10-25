import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthHeading, FormSkeleton, TextLink } from "../ui";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Set a New Password" };

export default function ResetPasswordPage({ searchParams }: PageProps<"/auth/reset-password">) {
  return (
    <>
      <AuthHeading
        title="Set a New Password"
        description="If an account exists for that email, we sent it a code. Enter it below with your new password."
      />
      <Suspense fallback={<FormSkeleton fields={3} />}>
        <ResetPasswordContent searchParams={searchParams} />
      </Suspense>
      <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        Didn’t get a code? <TextLink href="/auth/forgot-password">Send Another</TextLink>
      </p>
    </>
  );
}

async function ResetPasswordContent({ searchParams }: Pick<PageProps<"/auth/reset-password">, "searchParams">) {
  const { email } = await searchParams;
  return <ResetPasswordForm email={typeof email === "string" ? email : ""} />;
}
