/**
 * Auth configuration flags — dependency-free (no DB/NextAuth imports) so it can
 * be unit-tested and imported anywhere cheaply.
 *
 * The dev email login auto-provisions any user with no password: fine for local
 * dev, an impersonation hole in production. Enabled only outside production,
 * unless explicitly opted in with ALLOW_DEV_LOGIN=1 (e.g. staging).
 */
export function devLoginAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" || env.ALLOW_DEV_LOGIN === "1";
}
