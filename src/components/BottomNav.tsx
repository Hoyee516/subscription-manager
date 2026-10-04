"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CalendarDays, List, Zap, CreditCard } from "lucide-react";

const TABS = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/calendar", label: "Calendar", Icon: CalendarDays },
  { href: "/bills", label: "Bills", Icon: List },
  { href: "/utilities", label: "Utilities", Icon: Zap },
  { href: "/cards", label: "Cards", Icon: CreditCard },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white pb-[max(calc(env(safe-area-inset-bottom)+14px),24px)]">
      <ul className="mx-auto flex max-w-md justify-around px-1 pt-3 pb-1">
        {TABS.map(({ href, label, Icon }) => {
          const on = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-14 min-w-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
                  on ? "text-brand" : "text-[#6B7480]"
                }`}
              >
                <Icon size={22} strokeWidth={2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
