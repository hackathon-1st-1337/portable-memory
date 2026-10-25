"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SIGN_IN_PATH } from "@/lib/auth/paths";
import { authErrorMessage, field, type FormState } from "@/lib/auth/errors";

// Sign-in, sign-up, verification, and password reset run in the browser client (see their forms)
// so new sessions record the user's device. These actions never create a session.

export async function resendVerificationCode(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = field(formData, "email");
  if (!email) return { error: "Enter your email address first." };

  const { error } = await auth.emailOtp.sendVerificationOtp({ email, type: "email-verification" });
  if (error) {
    return { error: authErrorMessage(error, "Couldn’t send a new code. Try again."), fields: { email } };
  }
  return { success: `We sent a new code to ${email}.`, fields: { email } };
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = field(formData, "email");
  if (!email) return { error: "Enter the email address for your account." };

  const { error } = await auth.emailOtp.sendVerificationOtp({ email, type: "forget-password" });
  // Rate limits and outages are worth surfacing; anything else would leak whether the account exists.
  if (error && (error.status === 429 || error.code?.startsWith("NETWORK_"))) {
    return { error: authErrorMessage(error, "Couldn’t send a reset code. Try again."), fields: { email } };
  }

  redirect(`/auth/reset-password?email=${encodeURIComponent(email)}`);
}

export async function signOut() {
  await auth.signOut();
  redirect(SIGN_IN_PATH);
}
