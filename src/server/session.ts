import { redirect } from "next/navigation";
import { auth } from "@/server/auth";

/** Server-component guard: returns the session user or redirects to /login. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user;
}
