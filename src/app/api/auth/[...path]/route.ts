import { auth } from "@/lib/auth/server";

// Proxies every Better Auth request from the browser client to Neon Managed Auth.
export const { GET, POST, PUT, DELETE, PATCH } = auth.handler();
