import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) so the Docker
  // runtime image stays small — see the Dockerfile `web` stage.
  output: "standalone",
};

export default nextConfig;
