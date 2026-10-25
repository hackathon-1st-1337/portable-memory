type AuthErrorLike = {
  message?: string;
  code?: string;
  status?: number;
} | null | undefined;

const MESSAGES = {
  invalidCredentials: "That email and password don’t match. Check both and try again.",
  wrongCurrentPassword: "Your current password is incorrect.",
  userExists: "An account with this email already exists. Sign in instead.",
  emailNotVerified: "Verify your email before signing in.",
  weakPassword: "Use a password with 8–128 characters.",
  invalidOtp: "That code is incorrect. Check the email and try again.",
  expiredOtp: "That code has expired. Request a new one.",
  tooManyAttempts: "Too many attempts. Request a new code.",
  invalidEmail: "Enter a valid email address.",
  sessionExpired: "Your session expired. Sign in again to continue.",
  rateLimited: "Too many attempts. Wait a minute and try again.",
  network: "Can’t reach the authentication service. Check your connection and try again.",
};

// The server SDK normalizes Better Auth codes (e.g. INVALID_EMAIL_OR_PASSWORD → invalid_credentials);
// the browser client passes Better Auth codes through. Map both.
const BY_CODE: Record<string, string> = {
  invalid_credentials: MESSAGES.invalidCredentials,
  INVALID_EMAIL_OR_PASSWORD: MESSAGES.invalidCredentials,
  INVALID_PASSWORD: MESSAGES.wrongCurrentPassword,
  user_already_exists: MESSAGES.userExists,
  email_exists: MESSAGES.userExists,
  USER_ALREADY_EXISTS: MESSAGES.userExists,
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: MESSAGES.userExists,
  email_not_confirmed: MESSAGES.emailNotVerified,
  EMAIL_NOT_VERIFIED: MESSAGES.emailNotVerified,
  weak_password: MESSAGES.weakPassword,
  PASSWORD_TOO_SHORT: MESSAGES.weakPassword,
  PASSWORD_TOO_LONG: MESSAGES.weakPassword,
  INVALID_OTP: MESSAGES.invalidOtp,
  OTP_EXPIRED: MESSAGES.expiredOtp,
  TOO_MANY_ATTEMPTS: MESSAGES.tooManyAttempts,
  email_address_invalid: MESSAGES.invalidEmail,
  INVALID_EMAIL: MESSAGES.invalidEmail,
  session_expired: MESSAGES.sessionExpired,
  SESSION_EXPIRED: MESSAGES.sessionExpired,
  over_request_rate_limit: MESSAGES.rateLimited,
  over_email_send_rate_limit: MESSAGES.rateLimited,
};

// Normalized codes like `validation_failed` are too generic; the upstream message is specific.
const BY_MESSAGE: [RegExp, string][] = [
  [/user already exists/i, MESSAGES.userExists],
  [/invalid otp/i, MESSAGES.invalidOtp],
  [/otp (has )?expired/i, MESSAGES.expiredOtp],
  [/too many attempts/i, MESSAGES.tooManyAttempts],
  [/invalid password/i, MESSAGES.wrongCurrentPassword],
  [/password (is )?too (short|long)/i, MESSAGES.weakPassword],
];

/** Turns an SDK `{ error }` into a message that tells the user what to do next. */
export function authErrorMessage(error: AuthErrorLike, fallback: string): string {
  if (!error) return fallback;
  for (const [pattern, message] of BY_MESSAGE) {
    if (error.message && pattern.test(error.message)) return message;
  }
  if (error.code && BY_CODE[error.code]) return BY_CODE[error.code];
  if (error.status === 429) return MESSAGES.rateLimited;
  if (error.code?.startsWith("NETWORK_")) return MESSAGES.network;
  return error.message || fallback;
}

/** For browser-client calls, which can throw auth errors (not only return them). */
export function thrownAuthErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof TypeError) return MESSAGES.network; // fetch() itself failed
  if (err && typeof err === "object" && ("code" in err || "status" in err || "message" in err)) {
    return authErrorMessage(err as AuthErrorLike, fallback);
  }
  return fallback;
}

export function isEmailNotVerified(error: AuthErrorLike): boolean {
  return error?.code === "email_not_confirmed" || error?.code === "EMAIL_NOT_VERIFIED";
}

/** Shared state shape for auth form Server Actions used with useActionState. */
export type FormState = {
  error?: string;
  success?: string;
  /** Echo back non-secret fields so the form keeps them after a failed submit. */
  fields?: Record<string, string>;
} | null;

export function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Passwords are never trimmed: leading/trailing spaces are significant. */
export function secret(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Only allow same-origin relative redirects (prevents open redirects via ?next=). */
export function safeRedirectPath(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}
