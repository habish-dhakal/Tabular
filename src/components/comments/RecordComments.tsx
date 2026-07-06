"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Trash2 } from "lucide-react";

interface Member { id: string; name: string | null; email: string; image: string | null }
interface Comment {
  id: string;
  body: string;
  mentions: string[];
  createdAt: string;
  author: { id: string; name: string | null; email: string; image: string | null } | null;
}

const displayName = (m: { name: string | null; email: string }) => m.name || m.email.split("@")[0];
const initial = (s: string) => (s.trim()[0] ?? "?").toUpperCase();
const timeAgo = (iso: string) => {
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return d.toLocaleDateString();
};

/** Comment thread + @mention composer for a record (shown in the expanded record). */
export function RecordComments({ recordId, tableId }: { recordId: string; tableId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetch(`/api/records/${recordId}/comments`).then((r) => r.json()),
      fetch(`/api/tables/${tableId}/members`).then((r) => r.json()),
    ]).then(([cs, ms]) => {
      if (!alive) return;
      setComments(Array.isArray(cs) ? cs : []);
      setMembers(Array.isArray(ms) ? ms : []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [recordId, tableId]);

  // Detect an active "@query" immediately before the caret (no whitespace).
  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setBody(v);
    const caret = e.target.selectionStart ?? v.length;
    const upto = v.slice(0, caret);
    const m = upto.match(/@([^\s@]*)$/);
    setMentionQuery(m ? m[1] : null);
  }

  function insertMention(member: Member) {
    const ta = taRef.current;
    const caret = ta?.selectionStart ?? body.length;
    const upto = body.slice(0, caret);
    const rest = body.slice(caret);
    const replaced = upto.replace(/@([^\s@]*)$/, `@${displayName(member)} `);
    const next = replaced + rest;
    setBody(next);
    setMentionQuery(null);
    requestAnimationFrame(() => { ta?.focus(); const p = replaced.length; ta?.setSelectionRange(p, p); });
  }

  // Mentions = members whose @name appears in the body at send time.
  function resolveMentions(text: string): string[] {
    return members.filter((m) => text.includes(`@${displayName(m)}`)).map((m) => m.id);
  }

  async function send() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    const res = await fetch(`/api/records/${recordId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: text, mentions: resolveMentions(text) }),
    });
    setSending(false);
    if (res.ok) {
      const created: Comment = await res.json();
      setComments((prev) => [...prev, created]);
      setBody("");
      setMentionQuery(null);
    }
  }

  async function remove(id: string) {
    setComments((prev) => prev.filter((c) => c.id !== id));
    await fetch(`/api/comments/${id}`, { method: "DELETE" });
  }

  const filtered = mentionQuery !== null
    ? members.filter((m) => displayName(m).toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)
    : [];

  return (
    <div className="border-t border-border-token pt-3" data-testid="record-comments">
      <h4 className="mb-2 text-xs font-medium text-muted">Comments</h4>

      {loading ? (
        <div className="flex justify-center py-4 text-muted"><Loader2 className="animate-spin" size={16} /></div>
      ) : (
        <div className="space-y-3">
          {comments.length === 0 && <p className="text-xs text-muted">No comments yet.</p>}
          {comments.map((c) => (
            <div key={c.id} className="group flex gap-2" data-testid="comment">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-medium text-accent">
                {initial(c.author ? displayName(c.author) : "?")}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.author ? displayName(c.author) : "Unknown"}</span>
                  <span className="text-[11px] text-muted">{timeAgo(c.createdAt)}</span>
                  <button
                    onClick={() => remove(c.id)}
                    className="ml-auto text-muted opacity-0 transition group-hover:opacity-100 hover:text-red-600"
                    title="Delete comment"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm">{renderBody(c.body, members)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* composer */}
      <div className="relative mt-3">
        {filtered.length > 0 && (
          <div className="absolute bottom-full mb-1 w-56 overflow-hidden rounded-lg border border-border-token bg-background shadow-lg" data-testid="mention-menu">
            {filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => insertMention(m)}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-surface"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15 text-[10px] text-accent">{initial(displayName(m))}</span>
                <span className="truncate">{displayName(m)}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={taRef}
            data-testid="comment-input"
            value={body}
            onChange={onChange}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
            placeholder="Add a comment… use @ to mention"
            rows={2}
            className="flex-1 resize-y rounded-md border border-border-token bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
          <button
            data-testid="comment-send"
            onClick={send}
            disabled={!body.trim() || sending}
            className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Render a comment body, styling any @mentions of known members. */
function renderBody(body: string, members: Member[]) {
  const names = members.map(displayName).filter(Boolean).sort((a, b) => b.length - a.length);
  if (names.length === 0) return body;
  // Split on "@Name" occurrences, keeping the matches.
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`@(${escaped.join("|")})`, "g");
  const parts: (string | { m: string })[] = [];
  let last = 0;
  for (const match of body.matchAll(re)) {
    const i = match.index ?? 0;
    if (i > last) parts.push(body.slice(last, i));
    parts.push({ m: match[0] });
    last = i + match[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts.map((p, i) =>
    typeof p === "string" ? p : <span key={i} className="rounded bg-accent/10 px-0.5 font-medium text-accent">{p.m}</span>
  );
}
