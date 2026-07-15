export interface RuntimeEnvReport {
  ok: boolean;
  mode: string;
  errors: string[];
  warnings: string[];
  values: {
    devLoginEnabled: boolean;
    redisConfigured: boolean;
    githubAuthConfigured: boolean;
    emailConfigured: boolean;
    slackConfigured: boolean;
  };
}

function authSecret(env: NodeJS.ProcessEnv): string | undefined {
  return env.AUTH_SECRET || env.NEXTAUTH_SECRET;
}

function authUrl(env: NodeJS.ProcessEnv): string | undefined {
  return env.AUTH_URL || env.NEXTAUTH_URL;
}

export function validateRuntimeEnv(env: NodeJS.ProcessEnv = process.env): RuntimeEnvReport {
  const mode = env.NODE_ENV || "development";
  const production = mode === "production";
  const errors: string[] = [];
  const warnings: string[] = [];

  if (production && !env.DATABASE_URL) {
    errors.push("DATABASE_URL is required in production.");
  }

  const secret = authSecret(env);
  if (production && (!secret || secret.length < 32)) {
    errors.push("AUTH_SECRET or NEXTAUTH_SECRET must be at least 32 characters in production.");
  }

  if (production && env.ALLOW_DEV_LOGIN === "1") {
    errors.push("ALLOW_DEV_LOGIN cannot be enabled in production.");
  }

  if (production && !authUrl(env)) {
    warnings.push("AUTH_URL or NEXTAUTH_URL should be set in production.");
  }

  if (production && !env.REDIS_URL) {
    warnings.push("REDIS_URL is not set; automations and shared rate limits will be unavailable.");
  }

  if (production && !(env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET)) {
    warnings.push("AUTH_GITHUB_ID and AUTH_GITHUB_SECRET are not set; no production OAuth provider is configured.");
  }

  if (production && !(env.SMTP_URL || env.SMTP_HOST)) {
    warnings.push("SMTP_URL or SMTP_HOST is not set; email automation actions will fail unless stubbed.");
  }

  if (production && !env.EMAIL_FROM) {
    warnings.push("EMAIL_FROM is not set; outbound email has no configured sender.");
  }

  if (production && !env.SLACK_BOT_TOKEN) {
    warnings.push("SLACK_BOT_TOKEN is not set; Slack automation actions and target lookup will fail.");
  }

  if (production && env.AUTOMATIONS_STUB === "1") {
    warnings.push("AUTOMATIONS_STUB is enabled; outbound integrations will be stubbed.");
  }

  if (!production && !env.DATABASE_URL) {
    warnings.push("DATABASE_URL is not set; database-backed routes will fail.");
  }

  return {
    ok: errors.length === 0,
    mode,
    errors,
    warnings,
    values: {
      devLoginEnabled: env.ALLOW_DEV_LOGIN === "1" || !production,
      redisConfigured: Boolean(env.REDIS_URL),
      githubAuthConfigured: Boolean(env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET),
      emailConfigured: Boolean((env.SMTP_URL || env.SMTP_HOST) && env.EMAIL_FROM),
      slackConfigured: Boolean(env.SLACK_BOT_TOKEN),
    },
  };
}
