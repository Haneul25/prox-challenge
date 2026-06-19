import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@anthropic-ai/claude-agent-sdk",
    "voyageai",
  ],
};

export default nextConfig;
