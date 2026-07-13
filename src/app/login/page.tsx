import { devLoginEnabled, githubEnabled } from "@/server/auth";
import { LoginForm } from "@/components/auth/LoginForm";

// Which sign-in methods are offered depends on server config: the dev email
// login is disabled in production (see auth.ts), GitHub only when configured.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  // Only honor same-origin relative paths — never redirect off-site after login.
  const safe = callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
    ? callbackUrl
    : "/dashboard";
  return <LoginForm devLogin={devLoginEnabled} github={githubEnabled} callbackUrl={safe} />;
}
