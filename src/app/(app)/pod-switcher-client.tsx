"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";

interface PodInfo {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
}

export function PodSwitcherClient({
  pods,
  currentSlug,
}: {
  pods: PodInfo[];
  currentSlug?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect current pod from pathname if not explicitly passed
  let activeSlug = currentSlug;
  if (!activeSlug && pathname.startsWith("/p/")) {
    const parts = pathname.split("/");
    activeSlug = parts[2];
  }

  const activePod =
    pods.find((p) => p.slug === activeSlug) ??
    pods.find((p) => p.isDefault) ??
    pods[0];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(pod: PodInfo) {
    setOpen(false);
    // Keep the sub-route if on /p/[slug]/[tab], otherwise default to /memory
    if (pathname.startsWith("/p/")) {
      const parts = pathname.split("/");
      const subtab = parts[3] || "memory";
      router.push(`/p/${pod.slug}/${subtab}`);
    } else {
      router.push(`/p/${pod.slug}/memory`);
    }
  }

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-900 shadow-2xs hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus-visible:ring-zinc-100"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span className="size-2 rounded-full bg-emerald-500" />
        <span className="font-semibold">{activePod ? activePod.name : "Select Pod"}</span>
        <svg
          className="size-3 text-zinc-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1 w-48 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
            Switch Pod
          </div>
          {pods.map((pod) => (
            <button
              key={pod.id}
              onClick={() => handleSelect(pod)}
              className={
                "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors " +
                (pod.slug === activePod?.slug
                  ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60")
              }
            >
              <span>{pod.name}</span>
              {pod.isDefault && (
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                  Default
                </span>
              )}
            </button>
          ))}
          <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
          <Link
            href="/pods"
            onClick={() => setOpen(false)}
            className="block rounded-md px-2 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
          >
            Manage Pods →
          </Link>
        </div>
      )}
    </div>
  );
}
