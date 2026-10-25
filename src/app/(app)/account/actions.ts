"use server";

import { auth } from "@/lib/auth/server";
import { requireUser } from "@/lib/auth/session";
import { findOwnSessionToken } from "@/lib/auth/account";
import { authErrorMessage, field, secret, type FormState } from "@/lib/auth/errors";

// Every action re-reads the session itself; never trust the page that rendered the form.
// None of these call refresh(): a render inside the action still sees the request's old
// session cookie, so the client refreshes afterwards, once the browser holds the new one.

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const name = field(formData, "name");
  if (!name) return { error: "Enter a name." };
  if (name.length > 100) return { error: "Use a name with 100 characters or fewer.", fields: { name } };

  const { error } = await auth.updateUser({ name });
  if (error) return { error: authErrorMessage(error, "Couldn’t save your name. Try again."), fields: { name } };

  return { success: "Name saved.", fields: { name } };
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const currentPassword = secret(formData, "currentPassword");
  const newPassword = secret(formData, "newPassword");

  if (!currentPassword || !newPassword) return { error: "Enter your current and new password." };
  if (newPassword.length < 8) return { error: "Use a new password with at least 8 characters." };
  if (newPassword === currentPassword) return { error: "Choose a password you haven’t used here." };

  const { error } = await auth.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
  // The SDK reports a wrong current password as generic invalid credentials.
  if (error?.code === "invalid_credentials") return { error: "Your current password is incorrect." };
  if (error) return { error: authErrorMessage(error, "Couldn’t change your password. Try again.") };

  return { success: "Password changed. Other devices were signed out." };
}

export async function revokeSession(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const token = await findOwnSessionToken(field(formData, "sessionId"));
  if (!token) return { error: "That session already ended." };

  const { error } = await auth.revokeSession({ token });
  if (error) return { error: authErrorMessage(error, "Couldn’t sign out that device. Try again.") };

  return { success: "Device signed out." };
}

export async function revokeOtherSessions(): Promise<FormState> {
  await requireUser();
  const { error } = await auth.revokeOtherSessions();
  if (error) return { error: authErrorMessage(error, "Couldn’t sign out other devices. Try again.") };

  return { success: "All other devices were signed out." };
}
