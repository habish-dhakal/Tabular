import { devLoginEnabled, githubEnabled } from "@/server/auth";
import { LoginForm } from "@/components/auth/LoginForm";

// Which sign-in methods are offered depends on server config: the dev email
// login is disabled in production (see auth.ts), GitHub only when configured.
export default function LoginPage() {
  return <LoginForm devLogin={devLoginEnabled} github={githubEnabled} />;
}
