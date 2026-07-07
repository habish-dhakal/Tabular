import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) so the Docker
  // runtime image stays small — see the Dockerfile `web` stage.
  output: "standalone",
  // isolated-vm is a native addon (runScript automation action); it must not be
  // bundled — load it from node_modules at runtime.
  serverExternalPackages: ["isolated-vm"],
};

export default nextConfig;
