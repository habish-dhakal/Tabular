import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { users, workspaces, workspaceMembers } from "@/server/db/schema";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

const providers = [];

// GitHub OAuth — only enabled when credentials are present.
if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  providers.push(
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    })
  );
}

// Dev credentials provider — email only, auto-provisions the user.
// Replace with proper password hashing or remove in production.
const devSchema = z.object({ email: z.string().email(), name: z.string().optional() });

providers.push(
  Credentials({
    id: "dev",
    name: "Dev login (email)",
    credentials: {
      email: { label: "Email", type: "email" },
      name: { label: "Name", type: "text" },
    },
    async authorize(raw) {
      const parsed = devSchema.safeParse(raw);
      if (!parsed.success) return null;
      const { email, name } = parsed.data;

      const existing = await db.query.users.findFirst({
        where: eq(users.email, email),
      });
      if (existing) {
        return { id: existing.id, email: existing.email, name: existing.name, image: existing.image };
      }

      // First login: create the user + a default personal workspace.
      const [created] = await db
        .insert(users)
        .values({ email, name: name || email.split("@")[0] })
        .returning();

      const [ws] = await db
        .insert(workspaces)
        .values({ name: `${created.name}'s Workspace`, ownerId: created.id })
        .returning();
      await db
        .insert(workspaceMembers)
        .values({ workspaceId: ws.id, userId: created.id, role: "owner" });

      return { id: created.id, email: created.email, name: created.name, image: created.image };
    },
  })
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  // Trust the incoming request host instead of a fixed AUTH_URL. Without this,
  // Auth.js rejects the credentials callback with 401 when the dev port differs
  // from AUTH_URL (its Origin/host check fails). Standard for self-hosted/dev.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      return session;
    },
  },
});
