"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../cn";

export interface NavItem {
  href: string;
  label: string;
}

/** The app's own screens (Ask · Map · Inspect …). Current page is marked. */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Screens" className="-mx-1 flex items-center gap-0.5 overflow-x-auto">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors duration-150",
              active
                ? "bg-surface-2 text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
