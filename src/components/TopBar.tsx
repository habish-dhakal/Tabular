"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export function TopBar({ email, children }: { email?: string | null; children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border-token bg-background/85 px-5 backdrop-blur">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-contrast shadow-sm">
            T
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Tabular</span>
        </Link>
        {children}
      </div>
      <div className="flex items-center gap-1.5 text-sm text-muted">
        <NotificationBell />
        {email && <span className="mr-1 hidden text-[13px] sm:inline">{email}</span>}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 transition hover:bg-surface hover:text-foreground"
          title="Sign out"
        >
          <LogOut size={15} />
        </button>
      </div>
    </header>
  );
}
