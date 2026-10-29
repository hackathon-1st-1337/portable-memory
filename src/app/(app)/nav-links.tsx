"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/account", label: "Account" },
];

export function NavLinks() {
  const pathname = usePathname();

  let links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/pods", label: "Pods" },
  ];

  if (pathname.startsWith("/p/")) {
    const slug = pathname.split("/")[2];
    links = [
      { href: `/p/${slug}/memory`, label: "Memory" },
      { href: `/p/${slug}/graph`, label: "Graph" },
      { href: `/p/${slug}/dream`, label: "Dreaming" },
      { href: `/p/${slug}/agents`, label: "Agents" },
      { href: `/p/${slug}/audit`, label: "Audit Log" },
      { href: "/pods", label: "Pods" },
    ];
  }

  return (
    <nav aria-label="Main" className="flex items-center gap-1">
      {links.map(({ href, label }) => {
        const active = pathname === href || (href !== "/pods" && pathname.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100 " +
              (active
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100")
            }
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
