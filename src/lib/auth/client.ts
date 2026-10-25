"use client";

import { createAuthClient } from "@neondatabase/auth/next";

// Talks to the same-origin proxy at /api/auth/[...path]; takes no options.
export const authClient = createAuthClient();
