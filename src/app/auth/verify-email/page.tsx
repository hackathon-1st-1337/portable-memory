import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthHeading, FormSkeleton, TextLink } from "../ui";
import { VerifyEmailForm } from "./verify-email-form";

export const metadata: Metadata = { title: "Verify Your Email" };

export default function VerifyEmailPage({ searchParams }: PageProps<"/auth/verify-email">) {
  return (
    <>
      <AuthHeading
        title="Verify Your Email"
        description="Enter the 6-digit code we emailed you. It expires in a few minutes."
      />
      <Suspense fallback={<FormSkeleton fields={2} />}>
        <VerifyEmailContent searchParams={searchParams} />
      </Suspense>
      <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        Wrong account? <TextLink href="/auth/sign-in">Back to Sign In</TextLink>
      </p>
    </>
  );
}

async function VerifyEmailContent({ searchParams }: Pick<PageProps<"/auth/verify-email">, "searchParams">) {
  const { email } = await searchParams;
  return <VerifyEmailForm email={typeof email === "string" ? email : ""} />;
}
