"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export function TopBar({ email, children }: { email?: string | null; children?: React.ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border-token bg-background px-4">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="text-lg font-bold tracking-tight text-accent">
          Tabular
        </Link>
        {children}
      </div>
      <div className="flex items-center gap-3 text-sm text-muted">
        <NotificationBell />
        {email && <span className="hidden sm:inline">{email}</span>}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-surface"
          title="Sign out"
        >
          <LogOut size={15} />
        </button>
      </div>
    </header>
  );
}
