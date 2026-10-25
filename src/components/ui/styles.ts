// Plain module (no "use client") so Server Components can use these class helpers too.

export type ButtonVariant = "primary" | "secondary" | "danger";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white",
  secondary:
    "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100 " +
    "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
  danger:
    "border border-red-300 bg-white text-red-700 hover:bg-red-50 " +
    "dark:border-red-900 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950",
};

export function buttonClass(variant: ButtonVariant = "primary", extra = "") {
  return (
    "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium " +
    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
    "focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100 dark:focus-visible:ring-offset-zinc-950 " +
    "disabled:cursor-not-allowed disabled:opacity-60 " +
    `${buttonVariants[variant]} ${extra}`
  );
}
