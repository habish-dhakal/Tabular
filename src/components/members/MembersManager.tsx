"use client";

import { useState } from "react";
import { Check, Copy, Link2, Trash2, UserPlus } from "lucide-react";
import { useDialog } from "@/components/ui/DialogProvider";

// Mirror of member-policy INVITABLE_ROLES — kept local so this client bundle
// doesn't pull in the server schema module. "owner" is never grantable.
const INVITABLE_ROLES = ["admin", "editor", "commenter", "viewer"] as const;
const ROLE_HINT: Record<string, string> = {
  owner: "Full control, cannot be changed",
  admin: "Manage members, bases, and data",
  editor: "Create and edit records",
  commenter: "Comment, but not edit",
  viewer: "Read-only access",
};

interface MemberDTO {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  isOwner: boolean;
  joinedAt: string;
}
interface InviteDTO {
  id: string;
  workspaceId: string;
  role: string;
  email: string | null;
  state: "pending" | "accepted" | "expired";
  createdAt: string;
  expiresAt: string | null;
  invitedBy: { id: string; name: string | null; email: string } | null;
}

function initial(m: MemberDTO) {
  return (m.name || m.email || "?").trim().charAt(0).toUpperCase();
}

export function MembersManager({
  workspaceId,
  currentUserId,
  canManage,
  initialMembers,
  initialInvites,
}: {
  workspaceId: string;
  currentUserId: string;
  canManage: boolean;
  initialMembers: MemberDTO[];
  initialInvites: InviteDTO[];
}) {
  const dialog = useDialog();
  const [members, setMembers] = useState(initialMembers);
  const [invites, setInvites] = useState(initialInvites);
  const [inviteRole, setInviteRole] = useState<string>("editor");
  const [inviteEmail, setInviteEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const inviteLink = (id: string) =>
    typeof window === "undefined" ? `/invite/${id}` : `${window.location.origin}/invite/${id}`;

  async function copy(id: string) {
    try {
      await navigator.clipboard.writeText(inviteLink(id));
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600);
    } catch {
      await dialog.alert({ title: "Copy failed", message: inviteLink(id) });
    }
  }

  async function changeRole(m: MemberDTO, role: string) {
    if (role === m.role) return;
    setBusyId(m.id);
    const res = await fetch(`/api/workspaces/${workspaceId}/members/${m.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    });
    setBusyId(null);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Failed" }));
      await dialog.alert({ title: "Couldn't change role", message: error ?? "Something went wrong." });
      return;
    }
    setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, role } : x)));
  }

  async function remove(m: MemberDTO) {
    const ok = await dialog.confirm({
      title: "Remove member",
      message: `Remove ${m.name || m.email} from this workspace? They'll lose access to all its bases.`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    setBusyId(m.id);
    const res = await fetch(`/api/workspaces/${workspaceId}/members/${m.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Failed" }));
      await dialog.alert({ title: "Couldn't remove", message: error ?? "Something went wrong." });
      return;
    }
    setMembers((prev) => prev.filter((x) => x.id !== m.id));
  }

  async function createInvite() {
    setCreating(true);
    const res = await fetch(`/api/workspaces/${workspaceId}/invites`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: inviteRole, email: inviteEmail.trim() || null }),
    });
    setCreating(false);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Failed" }));
      await dialog.alert({ title: "Couldn't create invite", message: error ?? "Something went wrong." });
      return;
    }
    const inv: InviteDTO = await res.json();
    setInvites((prev) => [inv, ...prev]);
    setInviteEmail("");
    await copy(inv.id);
  }

  async function revoke(inv: InviteDTO) {
    const ok = await dialog.confirm({
      title: "Revoke invite",
      message: "This link will stop working immediately.",
      confirmLabel: "Revoke",
      danger: true,
    });
    if (!ok) return;
    setBusyId(inv.id);
    const res = await fetch(`/api/workspaces/${workspaceId}/invites/${inv.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Failed" }));
      await dialog.alert({ title: "Couldn't revoke", message: error ?? "Something went wrong." });
      return;
    }
    setInvites((prev) => prev.filter((x) => x.id !== inv.id));
  }

  const selectCls =
    "rounded-lg border border-border-token bg-background px-2.5 py-1.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-ring disabled:opacity-50";

  return (
    <div className="space-y-10" data-testid="members-manager">
      {/* Members */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Members · {members.length}
        </h2>
        <div className="divide-y divide-border-token overflow-hidden rounded-2xl border border-border-token">
          {members.map((m) => (
            <div key={m.id} data-testid="member-row" className="flex items-center gap-3 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent">
                {initial(m)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{m.name || m.email}</span>
                  {m.id === currentUserId && (
                    <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted">
                      You
                    </span>
                  )}
                </div>
                {m.name && <div className="truncate text-xs text-muted">{m.email}</div>}
              </div>
              {m.isOwner ? (
                <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium capitalize text-muted">
                  Owner
                </span>
              ) : canManage ? (
                <div className="flex items-center gap-1.5">
                  <select
                    aria-label={`Role for ${m.name || m.email}`}
                    className={selectCls + " capitalize"}
                    value={m.role}
                    disabled={busyId === m.id}
                    onChange={(e) => changeRole(m, e.target.value)}
                  >
                    {INVITABLE_ROLES.map((r) => (
                      <option key={r} value={r} className="capitalize">
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    aria-label={`Remove ${m.name || m.email}`}
                    onClick={() => remove(m)}
                    disabled={busyId === m.id}
                    className="rounded-lg p-2 text-muted transition hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ) : (
                <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium capitalize text-muted">
                  {m.role}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {canManage && (
        <>
          {/* Create invite */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
              Invite a teammate
            </h2>
            <div className="rounded-2xl border border-border-token p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Role</label>
                  <select
                    aria-label="Invite role"
                    className={selectCls + " capitalize"}
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                  >
                    {INVITABLE_ROLES.map((r) => (
                      <option key={r} value={r} className="capitalize">
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[14rem] flex-1">
                  <label className="mb-1 block text-xs font-medium text-muted">
                    Pin to email <span className="font-normal">(optional)</span>
                  </label>
                  <input
                    type="email"
                    placeholder="teammate@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full rounded-lg border border-border-token bg-background px-3 py-1.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-ring"
                  />
                </div>
                <button
                  onClick={createInvite}
                  disabled={creating}
                  data-testid="create-invite"
                  className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-contrast shadow-sm transition hover:bg-accent-hover disabled:opacity-50"
                >
                  <UserPlus size={16} />
                  Create link
                </button>
              </div>
              <p className="mt-2.5 text-xs text-muted">
                {ROLE_HINT[inviteRole]}. Links expire in 7 days.
                {inviteEmail.trim()
                  ? " Only the pinned email can accept."
                  : " Anyone with the link can join."}
              </p>
            </div>
          </section>

          {/* Pending invites */}
          {invites.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                Pending invites · {invites.length}
              </h2>
              <div className="divide-y divide-border-token overflow-hidden rounded-2xl border border-border-token">
                {invites.map((inv) => (
                  <div key={inv.id} data-testid="invite-row" className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-muted">
                      <Link2 size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {inv.email || "Anyone with the link"}
                        </span>
                        <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium uppercase capitalize text-muted">
                          {inv.role}
                        </span>
                        {inv.state === "expired" && (
                          <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-red-600">
                            Expired
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted">
                        {inv.state === "expired" ? "Expired" : "Expires"}{" "}
                        {inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : "never"}
                      </div>
                    </div>
                    <button
                      onClick={() => copy(inv.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-border-token px-2.5 py-1.5 text-xs font-medium text-muted transition hover:bg-surface hover:text-foreground"
                    >
                      {copied === inv.id ? <Check size={14} /> : <Copy size={14} />}
                      {copied === inv.id ? "Copied" : "Copy link"}
                    </button>
                    <button
                      aria-label="Revoke invite"
                      onClick={() => revoke(inv)}
                      disabled={busyId === inv.id}
                      className="rounded-lg p-2 text-muted transition hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
