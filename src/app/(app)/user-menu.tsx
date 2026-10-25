import { requireUser } from "@/lib/auth/session";
import { signOut } from "@/app/auth/actions";
import { SubmitButton } from "@/components/ui/form";

export async function UserMenu() {
  const user = await requireUser();

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="hidden min-w-0 flex-col text-right sm:flex">
        <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{user.name}</span>
        <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">{user.email}</span>
      </div>
      <form action={signOut}>
        <SubmitButton variant="secondary" pendingLabel="Signing Out…" className="px-3 py-1.5">
          Sign Out
        </SubmitButton>
      </form>
    </div>
  );
}

export function UserMenuSkeleton() {
  return (
    <div aria-hidden="true" className="flex items-center gap-3 motion-safe:animate-pulse">
      <div className="hidden h-8 w-32 rounded bg-zinc-100 sm:block dark:bg-zinc-900" />
      <div className="h-8 w-20 rounded-md bg-zinc-100 dark:bg-zinc-900" />
    </div>
  );
}
