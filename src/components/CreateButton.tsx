"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useDialog } from "@/components/ui/DialogProvider";

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
  const dialog = useDialog();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    const name = await dialog.prompt({ title: label, label: "Name", placeholder, confirmLabel: "Create" });
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
      await dialog.alert({ title: "Couldn't create", message: error ?? "Something went wrong." });
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
        "flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-contrast shadow-sm transition hover:bg-accent-hover disabled:opacity-50"
      }
    >
      <Plus size={16} />
      {label}
    </button>
  );
}
