"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

/** Generic "create by name" button — prompts for a name, POSTs, refreshes. */
export function CreateButton({
  label,
  endpoint,
  placeholder,
  className,
}: {
  label: string;
  endpoint: string;
  placeholder: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    const name = window.prompt(placeholder);
    if (!name?.trim()) return;
    setBusy(true);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Failed" }));
      alert(error ?? "Failed");
      return;
    }
    router.refresh();
  }

  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={
        className ??
        "flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      }
    >
      <Plus size={16} />
      {label}
    </button>
  );
}
