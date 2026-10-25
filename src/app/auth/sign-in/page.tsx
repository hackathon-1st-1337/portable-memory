import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AFTER_SIGN_IN_PATH } from "@/lib/auth/session";
import { safeRedirectPath } from "@/lib/auth/errors";
import { AuthHeading, FormSkeleton, TextLink } from "../ui";
import { Divider, SocialButtons } from "../social-buttons";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign In" };

export default function SignInPage({ searchParams }: PageProps<"/auth/sign-in">) {
  return (
    <>
      <AuthHeading title="Sign In" description="Manage your memory pod and agent connections." />
      <Suspense fallback={<FormSkeleton fields={2} />}>
        <SignInContent searchParams={searchParams} />
      </Suspense>
      <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        New to Portable Memory? <TextLink href="/auth/sign-up">Create an Account</TextLink>
      </p>
    </>
  );
}

async function SignInContent({ searchParams }: Pick<PageProps<"/auth/sign-in">, "searchParams">) {
  const params = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const next = safeRedirectPath(first(params.next), AFTER_SIGN_IN_PATH);

  let notice: string | undefined;
  if (first(params.verified)) notice = "Email verified. Sign in to continue.";
  if (first(params.reset)) notice = "Password updated. Sign in with your new password.";

  return (
    <div className="flex flex-col gap-5">
      <SocialButtons next={next} />
      <Divider />
      <SignInForm
        next={next}
        notice={notice}
        forgotLink={
          <Link
            href="/auth/forgot-password"
            className="rounded-sm text-xs font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 dark:focus-visible:ring-zinc-100"
          >
            Forgot Password?
          </Link>
        }
      />
    </div>
  );
}
