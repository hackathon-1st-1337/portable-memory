import type { Metadata } from "next";
import { AFTER_SIGN_IN_PATH } from "@/lib/auth/session";
import { AuthHeading, TextLink } from "../ui";
import { Divider, SocialButtons } from "../social-buttons";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create an Account" };

export default function SignUpPage() {
  return (
    <>
      <AuthHeading
        title="Create an Account"
        description="Set up one memory pod that every AI agent you connect can use."
      />
      <div className="flex flex-col gap-5">
        <SocialButtons next={AFTER_SIGN_IN_PATH} />
        <Divider />
        <SignUpForm />
      </div>
      <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        Already have an account? <TextLink href="/auth/sign-in">Sign In</TextLink>
      </p>
    </>
  );
}
