export function Logo() {
  return (
    <span className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="2" />
        <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="text-base font-semibold tracking-tight" translate="no">
        Portable Memory
      </span>
    </span>
  );
}
